import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { upsertCandidate } from "./notion.mjs";

/** 후보 JSON + (선택) 적합도 채점 JSON 병합 → 노션 적재 */
export async function collect(candPath, fitPath) {
  const wrap = JSON.parse(readFileSync(candPath, "utf8"));
  const candidates = Array.isArray(wrap) ? wrap : wrap.candidates || [];
  let fits = [];
  if (fitPath) {
    try {
      const raw = readFileSync(fitPath, "utf8").replace(/^[\s\S]*?\[/, "[").replace(/\][\s\S]*$/, "]");
      fits = JSON.parse(raw);
    } catch (e) { console.error("적합도 파싱 실패(무시):", e.message); }
  }
  const fitByN = new Map(fits.map((f) => [f.n, f]));
  const collectedAt = (wrap.collected_at || new Date().toISOString()).slice(0, 10);
  let created = 0, updated = 0, failed = 0, i = 0;
  for (const c of candidates) {
    i++;
    const f = fitByN.get(i);
    if (f) { c.scores = { fit: f.fit, reason: f.reason }; c.koTitle = f.ko; }
    c.step = c.step ?? 1;
    c.collectedAt = collectedAt;
    try {
      const r = await upsertCandidate(c);
      r.action === "create" ? created++ : updated++;
      console.error(`${r.action} ✓ ${(c.title || "").slice(0, 44)}`);
    } catch (e) {
      failed++;
      console.error(`✗ ${(c.title || "").slice(0, 44)}: ${e.message}`);
    }
  }
  console.error(`\n노션 적재 — 생성 ${created} · 갱신 ${updated} · 실패 ${failed}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [candPath, fitPath] = process.argv.slice(2);
  if (!candPath) {
    console.error("usage: node src/collect.mjs <candidates.json> [fit-scores.json]");
    process.exit(1);
  }
  await collect(candPath, fitPath);
}
