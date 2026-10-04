import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve, join } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const NOTES_DIR = resolve(__dirname, "../data/higgs-notes")

/**
 * Higgs 영상 심층분석 노트 저장소.
 * Node 서버는 MCP를 못 부르므로, Claude Code 세션이 Higgs video_analysis를 돌려
 * 아래 계약(shape)으로 이 디렉터리에 파일을 써 둔다. analyzeReferences가 읽어 프롬프트에 주입.
 *
 * 파일: data/higgs-notes/<videoId>.json
 * shape: {
 *   videoId, source:"higgs.video_analysis", analyzedAt(ISO),
 *   summary, visualStyle, editingPattern, hookVisual, thumbnailStrategy, captionStyle,
 *   scenes:[{ t:"0:00", visual, note }]
 * }
 */

const notePath = (videoId) => join(NOTES_DIR, `${videoId}.json`)

/** videoId의 Higgs 노트를 반환. 없으면 null. */
export function loadHiggsNote(videoId) {
  if (!videoId) return null
  const p = notePath(videoId)
  if (!existsSync(p)) return null
  try { return JSON.parse(readFileSync(p, "utf8")) } catch { return null }
}

/** Higgs 노트 저장(정제된 shape). analyzedAt이 없으면 호출부에서 넣어준다. */
export function saveHiggsNote(videoId, note) {
  if (!videoId) throw new Error("videoId 필요")
  if (!existsSync(NOTES_DIR)) mkdirSync(NOTES_DIR, { recursive: true })
  const body = { videoId, source: "higgs.video_analysis", ...note }
  writeFileSync(notePath(videoId), JSON.stringify(body, null, 2))
  return body
}

/** 노트가 이미 있는 videoId 집합. */
export function haveNotes() {
  if (!existsSync(NOTES_DIR)) return new Set()
  return new Set(readdirSync(NOTES_DIR).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)))
}

/** refs 중 Higgs 노트가 아직 없는 videoId 목록(수집 대상). */
export function missingNoteIds(refs) {
  const have = haveNotes()
  return [...new Set((refs || []).map((r) => r.videoId).filter(Boolean))].filter((id) => !have.has(id))
}

/** 노트를 프롬프트용 간결 블록으로 렌더. 없으면 빈 문자열. */
export function formatHiggsNote(note) {
  if (!note) return ""
  const L = []
  if (note.summary) L.push(`연출 요약: ${note.summary}`)
  if (note.hookVisual) L.push(`도입 비주얼: ${note.hookVisual}`)
  if (note.visualStyle) L.push(`비주얼 스타일: ${note.visualStyle}`)
  if (note.editingPattern) L.push(`편집 패턴: ${note.editingPattern}`)
  if (note.captionStyle) L.push(`자막 연출: ${note.captionStyle}`)
  if (note.thumbnailStrategy) L.push(`썸네일 전략: ${note.thumbnailStrategy}`)
  const scenes = Array.isArray(note.scenes) ? note.scenes.slice(0, 12) : []
  if (scenes.length) {
    L.push("장면별:")
    for (const s of scenes) L.push(`  ${s.t || "?"} · ${s.visual || ""}${s.note ? " — " + s.note : ""}`)
  }
  return L.join("\n")
}
