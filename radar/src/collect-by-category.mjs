import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { fetchNewUploads } from "./fetch-uploads.mjs";
import { collectHotVideos } from "./viewtrap/collect-hotvideos.mjs";
import { categoryScore, loadScoring } from "./score.mjs";
import { applyFit } from "./score-fit.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, "../config/radar-sources.yaml");
const OUT = resolve(__dirname, "../data/candidates-by-category.json");

export function loadSources() {
  return parseYaml(readFileSync(SRC, "utf8"));
}

export function methodsOf(catCfg) {
  return Array.isArray(catCfg.method) ? catCfg.method : [catCfg.method];
}

/** 채널 지정 수집 (주제·도입부·본문) */
async function collectChannel(category, catCfg, freshnessDays) {
  const out = [];
  for (const ch of catCfg.channels || []) {
    const { videos } = await fetchNewUploads(ch, { freshnessDays, max: 15 });
    for (const v of (videos || [])) out.push({ ...v, element: category, method: "channel" });
  }
  return out;
}

/** 뷰트랩 핫비디오 수집 — 구독자 낮은순 정렬 → 고조회 아웃라이어 (제목+썸네일·본문) */
async function collectViewtrap(category, catCfg) {
  const vt = catCfg.viewtrap || {};
  const res = await collectHotVideos({ minGrade: vt.minGrade || 'Good', limit: vt.limit || 30 });
  if (!res.authed) { console.warn('[viewtrap] 로그인 필요 — ' + category + ' 건너뜀 (rawCount=' + res.rawCount + ')'); return []; }
  console.log('[viewtrap] ' + category + ' authed=' + res.authed + ' raw=' + res.rawCount + ' filtered=' + (res.candidates||[]).length);
  return (res.candidates || []).map((v) => ({ ...v, element: category, method: 'viewtrap_hot' }));
}

export async function collectCategory(category, sources = loadSources()) {
  const catCfg = sources.categories?.[category];
  if (!catCfg) throw new Error(`unknown category: ${category}`);
  const freshnessDays = sources.freshness_days ?? 60;
  const scoring = loadScoring();
  const rows = [];
  for (const method of methodsOf(catCfg)) {
    if (method === "channel") rows.push(...(await collectChannel(category, catCfg, freshnessDays)));
    else if (method === "viewtrap_hot") rows.push(...(await collectViewtrap(category, catCfg)));
  }
  const seen = new Set();
  const scored = [];
  for (const r of rows) {
    const id = r.videoId || r.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    scored.push({ ...r, score: categoryScore(category, r, scoring) });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

export async function collectAll(sources = loadSources()) {
  const result = {};
  for (const category of Object.keys(sources.categories || {})) {
    result[category] = await collectCategory(category, sources);
  }
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const category = process.argv[2];
  const run = category ? { [category]: await collectCategory(category) } : await collectAll();
  if (!existsSync(dirname(OUT))) mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ collected_at: new Date().toISOString(), categories: run }, null, 2));
  console.log(`[collect-by-category] ${Object.entries(run).map(([k, v]) => `${k}=${v.length}`).join(" ")} → ${OUT}`);
}

/** 주어진 채널 ref 목록에서 채널 수집(스튜디오 "지금 수집"용) */
export async function collectFromChannels(category, refs, freshnessDays = 60, withFit = false) {
  const scoring = loadScoring()
  const rows = []
  for (const ch of refs || []) {
    try {
      const { videos } = await fetchNewUploads(ch, { freshnessDays, max: 15 })
      for (const v of (videos || [])) rows.push({ ...v, element: category, method: "channel" })
    } catch (e) { /* skip unresolved channel */ }
  }
  const seen = new Set()
  let unique = []
  for (const r of rows) {
    if (!r.videoId || seen.has(r.videoId)) continue
    seen.add(r.videoId)
    unique.push(r)
  }
  if (withFit && unique.length) {
    try { unique = await applyFit(unique) } catch (e) { console.warn("[fit] 채점 실패:", e.message) }
  }
  const out = unique.map((r) => ({ ...r, score: categoryScore(category, r, scoring) }))
  out.sort((a, b) => b.score - a.score)
  return out
}

/** radar 후보 → studio Candidate 형태 */
export function toStudioCandidate(c) {
  const views = c.viewCount ?? c.views ?? 0
  const subs = c.subscriberCount ?? c.subs ?? 0
  const ratio = subs ? Math.round((views / subs) * 10) / 10 : 0
  const isVt = c.method === "viewtrap_hot"
  return {
    id: c.videoId + "__" + c.element,
    videoId: c.videoId, element: c.element, method: c.method,
    title: c.title || "", koTitle: c.koTitle || c.title || "",
    channel: c.channelTitle || (isVt ? "소규모 채널" : ""),
    url: c.url || "", thumbnail: c.thumbnail || ("https://i.ytimg.com/vi/" + c.videoId + "/hqdefault.jpg"),
    views, subs, score: c.score ?? 0,
    scoreBasis: isVt
      ? ("성과 " + (c.performance || "-") + "·기여 " + (c.contribution || "-") + " · " + ratio + "x")
      : (c.scores && c.scores.fit != null ? ("적합도 " + c.scores.fit + " · 채널 수집") : "채널 수집 · 조회효율(적합도 채점 전)"),
    ...(isVt ? { viewtrap: { perf: c.performance || "-", contrib: c.contribution || "-", viewSubRatio: ratio } } : {}),
    status: "new",
  }
}
