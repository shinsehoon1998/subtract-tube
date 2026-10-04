import { Client } from "@notionhq/client";
import { loadEnv } from "./lib/env.mjs";
import { composite } from "./score.mjs";

const env = loadEnv();
const DB = env.NOTION_RADAR_DB_ID;
let _client;
function notion() {
  if (!env.NOTION_TOKEN) throw new Error("NOTION_TOKEN 없음 (radar/.env)");
  return (_client ??= new Client({ auth: env.NOTION_TOKEN }));
}

const sel = (v) => (v == null || v === "" ? { select: null } : { select: { name: String(v) } });
const txt = (v) => ({ rich_text: [{ text: { content: String(v ?? "").slice(0, 1900) } }] });

/** 후보 1건을 노션 DB에 upsert(URL 기준 중복 방지) */
export async function upsertCandidate(c) {
  if (!DB) throw new Error("NOTION_RADAR_DB_ID 없음 (radar/.env)");
  const n = notion();
  const props = {
    "제목": { title: [{ text: { content: (c.title || "(제목없음)").slice(0, 1900) } }] },
    "한글제목": txt(c.koTitle),
    "단계": sel(c.step ?? 1),
    "URL": { url: c.url || null },
    "채널": txt(c.channelTitle),
    "조회수": { number: c.viewCount ?? null },
    "구독자": { number: c.subscriberCount ?? null },
    "성과도": sel(c.performance),
    "기여도": sel(c.contribution),
    "적합도": { number: c.scores?.fit ?? null },
    "종합점수": { number: composite(c) },
    "썸네일": { url: c.thumbnail || null },
    "수집일": { date: { start: c.collectedAt || new Date().toISOString().slice(0, 10) } },
    "상태": sel(c.status || "신규"),
    "비고": txt(c.scores?.reason),
  };
  const found = await n.databases.query({
    database_id: DB,
    filter: { property: "URL", url: { equals: c.url } },
    page_size: 1,
  });
  if (found.results.length) {
    await n.pages.update({ page_id: found.results[0].id, properties: props });
    return { action: "update", id: found.results[0].id };
  }
  const page = await n.pages.create({ parent: { database_id: DB }, properties: props });
  return { action: "create", id: page.id };
}
