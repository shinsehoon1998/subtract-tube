import { writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve, join } from "node:path"
import { regroupCues } from "./cues.mjs"

const __dirname = dirname(fileURLToPath(import.meta.url))
const REMOTION_DIR = resolve(__dirname, "../../remotion")
const MANIFEST = join(REMOTION_DIR, "src/manifest.json")
const ASSETS_DIR = join(REMOTION_DIR, "public/assets")
const STYLE_CONFIG = resolve(__dirname, "../config/render-style.json")

/** 채널 렌더 스타일 config 로드(없으면 기본값). */
function loadStyle() {
  const def = { bg: "#0a0b0f", bgGlow: "#1b2330", text: "#f4f5f7", accent: "#5b9dff", bgImage: null, motionPreset: "calm", brandLabel: "빼기연구소 · EP01" }
  try { return { ...def, ...JSON.parse(readFileSync(STYLE_CONFIG, "utf8")) } } catch { return def }
}

/**
 * 원고 세그먼트 + 생성 음성(파일·길이) → remotion 매니페스트 조립.
 * script: { segments:[{idx,narration,subtitle,broll,visualDirection}], titleCandidates, ... }
 * voiceSegs: [{idx, file, duration, ok}]  (file은 public/audio 기준 상대경로)
 * → remotion/src/manifest.json 저장, 조립 요약 반환.
 */
export function buildManifest(projectId, script, voiceSegs, opts = {}) {
  const vmap = new Map((voiceSegs || []).filter((v) => v.ok && v.file).map((v) => [v.idx, v]))
  const brolls = existsSync(ASSETS_DIR)
    ? readdirSync(ASSETS_DIR).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).sort()
    : []

  const segments = []
  let i = 0
  for (const s of (script.segments || [])) {
    const v = vmap.get(s.idx)
    if (!v) continue // 음성 없는 세그먼트는 스킵
    const idx = String(s.idx).padStart(2, "0")
    // B-roll 우선순위: (1) 원고가 실제 파일명 지정 → (2) 세그먼트별 생성 이미지 broll-seg-XX.* → (3) 풀 순환
    const perSeg = brolls.find((f) => new RegExp(`^broll-seg-${idx}\\.`).test(f))
    const broll = s.broll && /\.(png|jpe?g|webp)$/i.test(s.broll) ? s.broll
      : perSeg || (brolls.length ? brolls[i % brolls.length] : undefined)
    // 화면 자막: LLM이 저작한 captionKeywords 우선(감독노트 제외), 없으면 subtitle → 나레이션 앞부분
    const kw = Array.isArray(s.captionKeywords) ? s.captionKeywords.map((x) => String(x).trim()).filter((x) => x && x.length <= 16).slice(0, 3) : []
    const caption_keywords = kw.length ? kw
      : (s.subtitle && String(s.subtitle).length <= 24 ? [String(s.subtitle).trim()] : [(s.narration || "").slice(0, 12)])
    segments.push({
      index: s.idx,
      file: v.file,
      motion: s.motion || null,
      broll,
      broll_desc: typeof s.broll === "string" ? s.broll : "",
      duration_sec: v.duration || 3,
      narration_normalized: s.narration || "",
      caption_keywords,
      subtitles: regroupCues(v.cues || []), // 문장 병합 + 어절 2줄 균형(가독성). cues.mjs.
      speed: 1,
      tone: i === 0 ? "intro" : "info",
      status: "ok",
    })
    i++
  }

  const total = segments.reduce((n, x) => n + (x.duration_sec || 0), 0)
  const manifest = {
    project: String(projectId || "project"),
    provider: "macos-say",
    voice_name: opts.voiceName || "Yuna",
    style: loadStyle(),
    fps: 30,
    total_segments: segments.length,
    total_duration_sec: Math.round(total * 100) / 100,
    bgm: existsSync(join(REMOTION_DIR, "public/audio/bgm.mp3")) ? "bgm.mp3" : undefined,
    assembledAt: opts.now || null,
    segments,
  }
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2))
  return { path: MANIFEST, segments: segments.length, total_duration_sec: manifest.total_duration_sec }
}
