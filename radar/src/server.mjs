import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync, createReadStream, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { collectCategory, collectFromChannels, toStudioCandidate, loadSources } from "./collect-by-category.mjs";
import { analyzeReferences, generateScript } from "./analyze.mjs";
import { resolveChannel } from "./fetch-uploads.mjs";
import { missingNoteIds, haveNotes } from "./higgs-notes.mjs";
import { startRender, renderStatus, publishBundle, listRenderJobs, renderOutput } from "./produce.mjs";
import { startVoiceGen, voiceStatus, audioFile, listThumbs, thumbFile, listVoiceJobs, readVoiceManifest } from "./generate.mjs";
import { buildManifest } from "./assemble.mjs";
import { readProfile, writeProfile, listLibrary, libraryFile, configInfo } from "./studio-console.mjs";
import { reconcileOnBoot, loadPersistedJobs } from "./job-store.mjs";
import { sourceChannels, writeCategoryChannels } from "./sources-store.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(__dirname, "../data/candidates-by-category.json");
const PORT = Number(process.env.RADAR_PORT || 5181);

const readData = () => { try { return JSON.parse(readFileSync(DATA, "utf8")); } catch { return { categories: {} }; } };
const writeData = (d) => writeFileSync(DATA, JSON.stringify(d, null, 2));
const flat = () => {
  const d = readData(); const out = [];
  for (const [element, rows] of Object.entries(d.categories || {})) for (const c of rows) out.push(toStudioCandidate({ ...c, element }));
  return out;
};
const configChannels = (cat) => { try { return loadSources().categories?.[cat]?.channels || []; } catch { return []; } };
const cors = (res) => { res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS"); res.setHeader("Access-Control-Allow-Headers", "Content-Type"); };
const json = (res, code, body) => { cors(res); res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };

const SCHED = resolve(__dirname, "../data/schedule.json");
const readSched = () => { try { return JSON.parse(readFileSync(SCHED, "utf8")); } catch { return { enabled: false, intervalHours: 24, categories: ["topic", "hook"], lastRun: null }; } };
const writeSched = (s) => writeFileSync(SCHED, JSON.stringify(s, null, 2));
let schedTimer = null;
async function runScheduled() {
  const s = readSched();
  for (const cat of (s.categories || [])) {
    try {
      const withFit = cat === "topic" || cat === "hook";
      const rows = await collectFromChannels(cat, configChannels(cat), 60, withFit);
      const d = readData(); d.categories = d.categories || {}; d.categories[cat] = rows; d.collected_at = new Date().toISOString(); writeData(d);
      console.log("[schedule] " + cat + " = " + rows.length);
    } catch (e) { console.warn("[schedule] " + cat + " 실패: " + e.message); }
  }
  const s2 = readSched(); s2.lastRun = new Date().toISOString(); writeSched(s2);
}
function applySchedule() {
  if (schedTimer) { clearInterval(schedTimer); schedTimer = null; }
  const s = readSched();
  if (s.enabled) { schedTimer = setInterval(runScheduled, Math.max(1, s.intervalHours) * 3600 * 1000); console.log("[schedule] enabled every " + s.intervalHours + "h"); }
}

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") { cors(res); res.writeHead(204); res.end(); return; }
  const url = new URL(req.url, "http://localhost");
  try {
    if (req.method === "GET" && url.pathname === "/api/candidates") return json(res, 200, { candidates: flat() });
    if (req.method === "GET" && url.pathname === "/api/health") return json(res, 200, { ok: true });
    if (req.method === "GET" && url.pathname === "/api/resolve") {
      const ref = url.searchParams.get("ref");
      if (!ref) return json(res, 400, { error: "ref required" });
      try { const ch = await resolveChannel(ref); return json(res, 200, { channelId: ch.channelId, title: ch.title }); }
      catch (e) { return json(res, 200, { error: String((e && e.message) || e) }); }
    }
    if (req.method === "GET" && url.pathname === "/api/schedule") return json(res, 200, readSched());
    if (req.method === "POST" && url.pathname === "/api/schedule") {
      let b = ""; for await (const ch of req) b += ch;
      const next = { ...readSched(), ...JSON.parse(b || "{}") };
      writeSched(next); applySchedule();
      return json(res, 200, next);
    }
    if (req.method === "POST" && url.pathname === "/api/schedule/run") { await runScheduled(); return json(res, 200, readSched()); }
    if (req.method === "POST" && url.pathname === "/api/higgs/missing") {
      let b = ""; for await (const ch of req) b += ch;
      const { refs } = JSON.parse(b || "{}");
      return json(res, 200, { missing: missingNoteIds(refs || []), have: [...haveNotes()] });
    }
    if (req.method === "POST" && url.pathname === "/api/analyze") {
      let b = ""; for await (const ch of req) b += ch;
      const { refs } = JSON.parse(b || "{}");
      return json(res, 200, await analyzeReferences(refs || []));
    }
    if (req.method === "POST" && url.pathname === "/api/script") {
      let b = ""; for await (const ch of req) b += ch;
      const { coreStructure, topic, titleThumbBench } = JSON.parse(b || "{}");
      return json(res, 200, await generateScript(coreStructure || {}, topic || "", titleThumbBench || null));
    }
    if (req.method === "POST" && url.pathname === "/api/assemble") {
      let b = ""; for await (const ch of req) b += ch;
      const { projectId, script } = JSON.parse(b || "{}");
      const segs = readVoiceManifest(projectId);
      if (!segs.length) return json(res, 200, { ok: false, error: "이 프로젝트의 생성 음성이 없습니다 — 3단계에서 음성을 먼저 생성하세요" });
      return json(res, 200, { ok: true, ...buildManifest(projectId, script || {}, segs) });
    }
    if (req.method === "POST" && url.pathname === "/api/render") {
      let b = ""; for await (const ch of req) b += ch;
      const { projectId } = JSON.parse(b || "{}");
      return json(res, 200, { jobId: startRender(projectId) });
    }
    if (req.method === "GET" && url.pathname === "/api/render/status") {
      const jobId = url.searchParams.get("jobId");
      if (!jobId) return json(res, 400, { error: "jobId required" });
      return json(res, 200, renderStatus(jobId));
    }
    if (req.method === "GET" && url.pathname === "/api/render/output") {
      const out = renderOutput(url.searchParams.get("project"));
      if (!out) return json(res, 404, { error: "렌더 결과 없음" });
      cors(res);
      res.writeHead(200, { "Content-Type": "video/mp4", "Content-Length": out.bytes });
      createReadStream(out.path).pipe(res);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/publish") {
      let b = ""; for await (const ch of req) b += ch;
      const { projectId, meta } = JSON.parse(b || "{}");
      return json(res, 200, publishBundle(projectId, meta || {}));
    }
    if (req.method === "POST" && url.pathname === "/api/generate/voice") {
      let b = ""; for await (const ch of req) b += ch;
      const { projectId, segments, voice } = JSON.parse(b || "{}");
      return json(res, 200, { jobId: startVoiceGen(projectId, segments || [], voice || "Yuna") });
    }
    if (req.method === "GET" && url.pathname === "/api/generate/status") {
      const jobId = url.searchParams.get("jobId");
      if (!jobId) return json(res, 400, { error: "jobId required" });
      return json(res, 200, voiceStatus(jobId));
    }
    if (req.method === "GET" && url.pathname === "/api/audio") {
      const f = url.searchParams.get("f");
      const a = f && audioFile(f);
      if (!a) return json(res, 404, { error: "audio 없음" });
      cors(res);
      res.writeHead(200, { "Content-Type": "audio/mp4", "Content-Length": a.size });
      a.stream().pipe(res);
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/thumbs") {
      return json(res, 200, { thumbs: listThumbs() });
    }
    // ── 스튜디오 콘솔: 채널프로파일 / 라이브러리 / 잡센터 / 설정 ──
    if (req.method === "GET" && url.pathname === "/api/profile") {
      return json(res, 200, readProfile());
    }
    if (req.method === "POST" && url.pathname === "/api/profile") {
      let b = ""; for await (const ch of req) b += ch;
      const { content } = JSON.parse(b || "{}");
      return json(res, 200, writeProfile(content ?? ""));
    }
    if (req.method === "GET" && url.pathname === "/api/library") {
      return json(res, 200, { items: listLibrary() });
    }
    if (req.method === "GET" && url.pathname === "/api/library/file") {
      const lf = libraryFile(url.searchParams.get("project"), url.searchParams.get("f"));
      if (!lf) return json(res, 404, { error: "파일 없음" });
      cors(res);
      res.writeHead(200, { "Content-Type": lf.type, "Content-Length": lf.size });
      lf.stream().pipe(res);
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/jobs") {
      const live = [...listRenderJobs(), ...listVoiceJobs()];
      const liveIds = new Set(live.map((j) => j.jobId));
      const persistedOnly = loadPersistedJobs().filter((j) => !liveIds.has(j.jobId)); // 재시작 전 이력
      const jobs = [...live, ...persistedOnly].sort((a, b) => String(b.startedAt || "").localeCompare(String(a.startedAt || "")));
      return json(res, 200, { jobs });
    }
    if (req.method === "GET" && url.pathname === "/api/config") {
      return json(res, 200, configInfo());
    }
    // ── 지정 채널 저장(도입부 등): UI 편집을 yaml에 반영해 스케줄러·폴백을 정합화 ──
    if (req.method === "GET" && url.pathname === "/api/sources") {
      return json(res, 200, { channels: sourceChannels() });
    }
    if (req.method === "POST" && url.pathname === "/api/sources") {
      let b = ""; for await (const ch of req) b += ch;
      const { category, channels } = JSON.parse(b || "{}");
      if (!category) return json(res, 400, { error: "category required" });
      const saved = writeCategoryChannels(category, channels || []);
      return json(res, 200, { category, channels: saved });
    }
    if (req.method === "GET" && url.pathname === "/api/thumb") {
      const f = url.searchParams.get("f");
      const t = f && thumbFile(f);
      if (!t) return json(res, 404, { error: "thumb 없음" });
      cors(res);
      res.writeHead(200, { "Content-Type": t.type, "Content-Length": t.size });
      t.stream().pipe(res);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/collect") {
      let body = ""; for await (const ch of req) body += ch;
      const { category, channels } = JSON.parse(body || "{}");
      if (!category) return json(res, 400, { error: "category required" });
      const withFit = category === "topic" || category === "hook";
      const valid = (channels || []).filter((c) => /^UC[\w-]{10,}$/.test(c) || /^@/.test(c) || /youtube\.com|youtu\.be/.test(c));
      const refs = valid.length ? [...new Set(valid)] : configChannels(category);
      // UI가 지정 채널을 보냈으면 yaml에 저장 → 스케줄러·폴백이 같은 채널을 쓰도록 정합화(도입부 오수집 방지)
      if (valid.length && category !== "title_thumb") { try { writeCategoryChannels(category, refs); } catch (e) { console.warn("[sources] 저장 실패:", e.message); } }
      const rows = category === "title_thumb"
        ? await collectCategory("title_thumb")
        : await collectFromChannels(category, refs, 60, withFit);
      const d = readData(); d.categories = d.categories || {};
      if (rows.length === 0 && (d.categories[category] || []).length > 0) {
        return json(res, 200, { category, count: d.categories[category].length, preserved: true, candidates: d.categories[category].map((c) => toStudioCandidate({ ...c, element: category })) });
      }
      d.categories[category] = rows; d.collected_at = new Date().toISOString(); writeData(d);
      return json(res, 200, { category, count: rows.length, candidates: rows.map((c) => toStudioCandidate({ ...c, element: category })) });
    }
    json(res, 404, { error: "not found" });
  } catch (e) { json(res, 500, { error: String((e && e.message) || e) }); }
});
applySchedule();
const reconciled = reconcileOnBoot();
if (reconciled) console.log("[radar-server] 부팅 복구: 중단된 잡 " + reconciled + "개 실패 처리");
server.listen(PORT, () => console.log("[radar-server] listening http://localhost:" + PORT));
