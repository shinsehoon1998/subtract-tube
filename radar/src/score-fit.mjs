import { loadEnv } from "./lib/env.mjs";
import { fitPrompt } from "./fit-prompt.mjs";

const MODEL = process.env.FIT_MODEL || "claude-haiku-4-5-20251001";
const CHUNK = 12;

function parseFitJson(text) {
  let t = (text || "").trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const a = t.indexOf("["), b = t.lastIndexOf("]");
  if (a >= 0 && b > a) t = t.slice(a, b + 1);
  try { return JSON.parse(t); } catch { return salvage(t); }
}

/** 잘린 JSON 배열에서 완성된 객체만 건져낸다 */
function salvage(t) {
  const out = [];
  const re = /\{[^{}]*\}/g;
  let m;
  while ((m = re.exec(t))) { try { out.push(JSON.parse(m[0])); } catch { /* skip */ } }
  return out;
}

/** 후보 배열(≤CHUNK) → Anthropic Messages API 채점 → [{n,ko,audience_fit,theme_fit,borrowability,fit,reason}] */
export async function scoreFit(candidates) {
  if (!candidates.length) return [];
  const key = loadEnv().ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY 없음");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: 8000, messages: [{ role: "user", content: fitPrompt(candidates) }] }),
  });
  if (!r.ok) throw new Error("anthropic " + r.status + ": " + (await r.text().catch(() => "")).slice(0, 200));
  const data = await r.json();
  const text = (data.content || []).map((x) => x.text || "").join("");
  return parseFitJson(text);
}

/** 채점 결과를 후보에 주입(배치 분할로 토큰 한도 회피) */
export async function applyFit(candidates) {
  const result = new Map();
  for (let i = 0; i < candidates.length; i += CHUNK) {
    const chunk = candidates.slice(i, i + CHUNK);
    let scores = [];
    try { scores = await scoreFit(chunk); } catch (e) { console.warn("[fit] chunk 실패:", e.message); }
    for (const s of scores) {
      const idx = i + (Number(s.n) - 1);
      if (idx >= 0 && idx < candidates.length) result.set(idx, s);
    }
  }
  return candidates.map((c, i) => {
    const s = result.get(i);
    if (!s) return c;
    return { ...c, scores: { ...(c.scores || {}), fit: s.fit }, koTitle: s.ko || c.koTitle, audience_fit: s.audience_fit, theme_fit: s.theme_fit, borrowability: s.borrowability, reason: s.reason };
  });
}
