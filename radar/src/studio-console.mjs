import { readFileSync, writeFileSync, existsSync, statSync, readdirSync, mkdirSync, createReadStream } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve, join } from "node:path"
import { loadEnv } from "./lib/env.mjs"

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROFILE = resolve(__dirname, "../../config/channel-profile.md")
const PUBLISHED_DIR = resolve(__dirname, "../data/published")

/** 스튜디오 콘솔(채널프로파일·라이브러리·설정) 백엔드. 실제 파일 기반. */

// ── 채널 프로파일 ────────────────────────────────────────────
export function readProfile() {
  if (!existsSync(PROFILE)) return { exists: false, content: "", path: PROFILE, updatedAt: null }
  const st = statSync(PROFILE)
  return { exists: true, content: readFileSync(PROFILE, "utf8"), path: PROFILE, bytes: st.size, updatedAt: st.mtime.toISOString() }
}
export function writeProfile(content) {
  if (typeof content !== "string") return { ok: false, error: "content must be string" }
  mkdirSync(dirname(PROFILE), { recursive: true })
  writeFileSync(PROFILE, content)
  return { ok: true, bytes: Buffer.byteLength(content), updatedAt: new Date().toISOString() }
}

// ── 라이브러리 (발행 번들) ───────────────────────────────────
export function listLibrary() {
  if (!existsSync(PUBLISHED_DIR)) return []
  const out = []
  for (const name of readdirSync(PUBLISHED_DIR)) {
    const dir = join(PUBLISHED_DIR, name)
    try { if (!statSync(dir).isDirectory()) continue } catch { continue }
    const files = readdirSync(dir)
    let metadata = null
    try { metadata = JSON.parse(readFileSync(join(dir, "metadata.json"), "utf8")) } catch {}
    const videoBytes = files.includes("video.mp4") ? statSync(join(dir, "video.mp4")).size : 0
    out.push({
      projectId: name,
      title: metadata?.title || name,
      description: metadata?.description || "",
      tags: metadata?.tags || [],
      status: metadata?.status || "ready",
      preparedAt: metadata?.preparedAt || null,
      files,
      hasVideo: files.includes("video.mp4"),
      hasThumbnail: files.some((f) => /^thumbnail\./.test(f)),
      thumbnailFile: files.find((f) => /^thumbnail\./.test(f)) || null,
      videoBytes,
    })
  }
  return out.sort((a, b) => String(b.preparedAt || "").localeCompare(String(a.preparedAt || "")))
}

/** 번들 파일 스트리밍. project/f 경로 이탈 방지. */
export function libraryFile(project, f) {
  const slug = String(project || "").replace(/[^\w.-]/g, "_")
  const base = join(PUBLISHED_DIR, slug)
  const p = resolve(base, f || "")
  if (!p.startsWith(base) || !existsSync(p)) return null
  const type = /\.mp4$/i.test(p) ? "video/mp4" : /\.png$/i.test(p) ? "image/png" : /\.json$/i.test(p) ? "application/json" : "application/octet-stream"
  return { path: p, size: statSync(p).size, type, stream: () => createReadStream(p) }
}

// ── 설정/구성 ────────────────────────────────────────────────
export function configInfo() {
  const e = loadEnv()
  const has = (k) => !!(e[k] && String(e[k]).trim())
  return {
    keys: {
      anthropic: has("ANTHROPIC_API_KEY"),
      youtube: has("YOUTUBE_API_KEY"),
      elevenlabs: has("ELEVENLABS_API_KEY"),
      higgsfield: has("HIGGSFIELD_API_KEY") && has("HIGGSFIELD_API_SECRET"),
    },
    voice: {
      engine: has("ELEVENLABS_API_KEY") ? "elevenlabs" : "say",
      name: has("ELEVENLABS_API_KEY") ? "신세훈" : "Yuna",
      voiceId: e.ELEVENLABS_VOICE_ID || "ffahuWxygSEUsjylklR5",
    },
  }
}
