import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { loadEnv } from "./lib/env.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const API = "https://www.googleapis.com/youtube/v3";

const env = loadEnv();
const KEY = env.YOUTUBE_API_KEY;

async function api(path, params) {
  if (!KEY) throw new Error("YOUTUBE_API_KEY 없음 (빼기연구소/.env 확인)");
  const url = new URL(`${API}/${path}`);
  url.search = new URLSearchParams({ ...params, key: KEY }).toString();
  const r = await fetch(url);
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`YouTube API ${path} ${r.status}: ${body.slice(0, 300)}`);
  }
  return r.json();
}

/** 채널 식별자(@handle | UC...채널ID | 채널 URL) → 메타 + 업로드 재생목록 */
export async function resolveChannel(idOrHandle) {
  const v = String(idOrHandle).trim().replace(/^https?:\/\/(www\.)?youtube\.com\//, "");
  const params = v.startsWith("UC") && v.length > 20
    ? { id: v }
    : { forHandle: v.startsWith("@") ? v : `@${v}` };
  const data = await api("channels", {
    part: "contentDetails,statistics,snippet",
    ...params,
    maxResults: "1",
  });
  const c = data.items?.[0];
  if (!c) throw new Error(`채널 해석 실패: ${idOrHandle}`);
  return {
    channelId: c.id,
    title: c.snippet.title,
    subs: Number(c.statistics.subscriberCount ?? 0),
    uploadsPlaylist: c.contentDetails.relatedPlaylists.uploads,
  };
}

const ISO_DUR = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
function durToSec(iso) {
  const m = ISO_DUR.exec(iso || "") || [];
  return +(m[1] || 0) * 3600 + +(m[2] || 0) * 60 + +(m[3] || 0);
}

/** 한 채널의 freshness 이내 신규 업로드 + 통계 */
export async function fetchNewUploads(idOrHandle, { freshnessDays = 30, max = 15 } = {}) {
  const ch = await resolveChannel(idOrHandle);
  const pl = await api("playlistItems", {
    part: "snippet,contentDetails",
    playlistId: ch.uploadsPlaylist,
    maxResults: String(Math.min(50, max)),
  });
  const cutoff = Date.now() - freshnessDays * 86400 * 1000;
  const fresh = (pl.items || []).filter((it) => {
    const at = it.contentDetails?.videoPublishedAt || it.snippet.publishedAt;
    return new Date(at).getTime() >= cutoff;
  });
  if (!fresh.length) return { channel: ch, videos: [] };

  const ids = fresh.map((it) => it.contentDetails.videoId);
  const stats = await api("videos", {
    part: "statistics,contentDetails",
    id: ids.join(","),
  });
  const byId = new Map((stats.items || []).map((v) => [v.id, v]));

  const videos = fresh.map((it) => {
    const id = it.contentDetails.videoId;
    const v = byId.get(id);
    const th = it.snippet.thumbnails || {};
    return {
      videoId: id,
      url: `https://www.youtube.com/watch?v=${id}`,
      title: it.snippet.title,
      channelId: ch.channelId,
      channelTitle: ch.title,
      subscriberCount: ch.subs,
      publishedAt: (it.contentDetails.videoPublishedAt || it.snippet.publishedAt).slice(0, 10),
      viewCount: Number(v?.statistics?.viewCount ?? 0),
      durationSec: durToSec(v?.contentDetails?.duration),
      thumbnail: (th.maxres || th.high || th.medium || th.default || {}).url || "",
      source: "youtube",
      step: 1,
    };
  });
  return { channel: ch, videos };
}

/** 채널 목록 로드: --channel 오버라이드(테스트) > config/radar-channels.yaml */
async function loadChannels() {
  const argi = process.argv.indexOf("--channel");
  if (argi >= 0 && process.argv[argi + 1]) return [process.argv[argi + 1]];
  const cfg = resolve(__dirname, "../config/radar-channels.yaml");
  if (!existsSync(cfg)) throw new Error(`채널 설정 없음: ${cfg}`);
  const { parse } = await import("yaml"); // 지연 import — --channel 경로는 yaml 미설치여도 동작
  const doc = parse(readFileSync(cfg, "utf8")) || {};
  return (doc.channels || [])
    .map((c) => (typeof c === "string" ? c : c?.id || c?.handle))
    .filter(Boolean);
}

// CLI 진입점
function loadState() {
  const p = resolve(__dirname, "../data/radar-state.json");
  if (existsSync(p)) { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return { seen: {} }; } }
  return { seen: {} };
}
function saveState(state) {
  mkdirSync(resolve(__dirname, "../data"), { recursive: true });
  writeFileSync(resolve(__dirname, "../data/radar-state.json"), JSON.stringify(state, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const freshnessDays = Number(env.FRESHNESS_DAYS || 30);
  const backfill = process.argv.includes("--all"); // 상태 무시(전체)
  const channels = await loadChannels();
  if (!channels.length) {
    console.error("채널이 비어 있습니다. config/radar-channels.yaml에 지정 채널을 넣으세요.");
    process.exit(1);
  }
  const collected = [];
  for (const ch of channels) {
    try {
      const { channel, videos } = await fetchNewUploads(ch, { freshnessDays });
      console.error(`✓ ${channel.title} (${channel.subs.toLocaleString()} subs) → ${videos.length}건`);
      collected.push(...videos);
    } catch (e) {
      console.error(`✗ ${ch}: ${e.message}`);
    }
  }
  // 상태 기반 신규 필터(이미 본 videoId 제외)
  const state = loadState();
  const fresh = backfill ? collected : collected.filter((v) => !state.seen[v.videoId]);
  const stamp = new Date().toISOString().slice(0, 10);
  for (const v of fresh) state.seen[v.videoId] = stamp;
  if (!backfill) saveState(state);
  const outDir = resolve(__dirname, "../data");
  mkdirSync(outDir, { recursive: true });
  const out = resolve(outDir, `candidates-${stamp}.json`);
  writeFileSync(out, JSON.stringify({ collected_at: new Date().toISOString(), freshnessDays, count: fresh.length, total_fetched: collected.length, candidates: fresh }, null, 2));
  console.error(`\n신규 ${fresh.length}건 (수집 ${collected.length}건 중) → ${out}`);
}
