import { execFile } from "node:child_process"
import { existsSync, mkdirSync, writeFileSync, readFileSync, createReadStream, statSync, readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve, join } from "node:path"
import { promisify } from "node:util"
import { loadEnv } from "./lib/env.mjs"
import { upsertJob } from "./job-store.mjs"

const snapVoice = (j) => ({ kind: "voice", jobId: j.jobId, projectId: j.projectId, status: j.status, progress: j.progress, engine: j.engine, voice: j.voice, done: j.done, total: j.total, startedAt: j.createdAt, error: j.error })

const exec = promisify(execFile)
const __dirname = dirname(fileURLToPath(import.meta.url))
const AUDIO_BASE = resolve(__dirname, "../../remotion/public/audio/gen")
const slug = (projectId) => String(projectId || "default").replace(/[^\w.-]/g, "_")
const audioDirFor = (projectId) => join(AUDIO_BASE, slug(projectId))

// 신세훈 보이스클론(기본). ELEVENLABS_VOICE_ID 로 재정의 가능.
const DEFAULT_VOICE_ID = "ffahuWxygSEUsjylklR5"
const EL_MODEL = "eleven_multilingual_v2"

/**
 * 음성 생성. 우선순위:
 *   1) ELEVENLABS_API_KEY 있으면 → ElevenLabs HTTP API(신세훈 클론, 고품질) → mp3
 *   2) 없으면 → macOS say(Yuna) + afconvert → m4a (헤드리스 폴백, 저품질)
 * afinfo 로 길이 측정.
 */

/** 문자 단위 타이밍 → 화면 자막 라인 큐. 문장부호 또는 ~16자에서 줄바꿈. */
function buildCues(alignment) {
  if (!alignment || !Array.isArray(alignment.characters)) return []
  const chars = alignment.characters
  const starts = alignment.character_start_times_seconds || []
  const ends = alignment.character_end_times_seconds || []
  const cues = []
  let buf = "", s = null, e = 0
  const flush = () => { const t = buf.trim(); if (t && s !== null) cues.push({ text: t, start: Math.round(s * 100) / 100, end: Math.round(e * 100) / 100 }); buf = ""; s = null }
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]
    if (s === null && c.trim()) s = starts[i]
    buf += c; e = ends[i]
    if (/[.!?…]/.test(c) || (buf.replace(/\s/g, "").length >= 16 && /\s/.test(c))) flush()
  }
  flush()
  return cues
}

/** fetch + 지수 백오프 재시도(429·5xx·네트워크). 그 외는 그대로 반환(호출부가 처리). */
async function fetchRetry(url, opts, tries = 3) {
  let last
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, opts)
      if (r.ok || (r.status < 500 && r.status !== 429)) return r
      last = new Error("http " + r.status)
    } catch (e) { last = e }
    await new Promise((res) => setTimeout(res, 500 * Math.pow(2, i)))
  }
  throw last || new Error("fetch 실패")
}

/** ElevenLabs HTTP TTS(with-timestamps) → mp3 저장 + 라인 큐. { rel, cues } 반환. */
async function elevenTTS(text, idx, key, voiceId, dir, rel) {
  const mp3 = join(dir, `seg-${idx}.mp3`)
  const r = await fetchRetry(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ text, model_id: EL_MODEL, voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true } }),
  })
  if (!r.ok) throw new Error("elevenlabs " + r.status + ": " + (await r.text().catch(() => "")).slice(0, 200))
  const d = await r.json()
  writeFileSync(mp3, Buffer.from(d.audio_base64, "base64"))
  return { rel: `${rel}/seg-${idx}.mp3`, cues: buildCues(d.alignment) }
}

/** macOS say → m4a (폴백, dir). 타임스탬프 없음(cues=[]). { rel, cues } 반환. */
async function sayTTS(text, idx, voice, dir, rel) {
  const aiff = join(dir, `seg-${idx}.aiff`)
  const m4a = join(dir, `seg-${idx}.m4a`)
  await exec("say", ["-v", voice, "-o", aiff, "--", text], { timeout: 120000 })
  await exec("afconvert", [aiff, m4a, "-f", "m4af", "-d", "aac"], { timeout: 60000 })
  return { rel: `${rel}/seg-${idx}.m4a`, cues: [] }
}

/** afinfo 로 오디오 길이(초) 측정. 실패 시 0. */
async function durationOf(relFile) {
  try {
    const p = resolve(__dirname, "../../remotion/public/audio", relFile)
    const { stdout } = await exec("afinfo", [p], { timeout: 15000 })
    const m = stdout.match(/estimated duration:\s*([\d.]+)/i)
    return m ? Math.round(parseFloat(m[1]) * 100) / 100 : 0
  } catch { return 0 }
}

const jobs = new Map() // jobId -> { status, progress, voice, total, done, segs:[{idx,file,duration,ok,error}], error }
let seq = 0

/** 음성 생성 시작. segments: [{idx, narration}], voice(fallback say 음성) → jobId */
export function startVoiceGen(projectId, segments, voice = "Yuna") {
  const jobId = "v" + Date.now() + "-" + ++seq
  const env = loadEnv()
  const key = env.ELEVENLABS_API_KEY
  const voiceId = env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID
  const engine = key ? "elevenlabs" : "say"
  const list = (segments || []).filter((s) => s && s.narration && String(s.narration).trim())
  const dir = audioDirFor(projectId)
  const rel = "gen/" + slug(projectId)
  const job = { jobId, projectId, status: "running", progress: 0, engine, voice: engine === "elevenlabs" ? "신세훈" : voice, sayVoice: voice, dir, rel, total: list.length, done: 0, segs: [], error: null, createdAt: new Date().toISOString() }
  jobs.set(jobId, job)
  upsertJob(snapVoice(job))
  if (!list.length) { job.status = "failed"; job.error = "나레이션이 있는 세그먼트가 없습니다"; upsertJob(snapVoice(job)); return jobId }
  mkdirSync(dir, { recursive: true })
  runVoice(job, list, key, voiceId).catch((e) => { job.status = "failed"; job.error = String(e && e.message || e) })
  return jobId
}

async function runVoice(job, list, key, voiceId) {
  for (const s of list) {
    const idx = String(s.idx).padStart(2, "0")
    try {
      const out = key
        ? await elevenTTS(String(s.narration), idx, key, voiceId, job.dir, job.rel)
        : await sayTTS(String(s.narration), idx, job.sayVoice, job.dir, job.rel)
      const duration = await durationOf(out.rel)
      job.segs.push({ idx: s.idx, file: out.rel, duration, cues: out.cues || [], ok: true, error: null })
    } catch (e) {
      job.segs.push({ idx: s.idx, file: null, duration: 0, ok: false, error: String(e && e.message || e).slice(0, 200) })
    }
    job.done += 1
    job.progress = Math.round((job.done / job.total) * 100)
  }
  // 프로젝트별 음성 매니페스트 기록(렌더 매니페스트 갱신에 활용 가능)
  try {
    const dir = resolve(__dirname, "../data/voice"); mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, String(job.projectId || "project").replace(/[^\w.-]/g, "_") + ".json"),
      JSON.stringify({ projectId: job.projectId, engine: job.engine, voice: job.voice, segs: job.segs, generatedAt: new Date().toISOString() }, null, 2))
  } catch {}
  job.status = job.segs.every((x) => x.ok) ? "done" : (job.segs.some((x) => x.ok) ? "partial" : "failed")
  upsertJob(snapVoice(job))
}

export function voiceStatus(jobId) {
  return jobs.get(jobId) || { error: "unknown jobId" }
}

/** 프로젝트별 저장된 음성 매니페스트(seg 목록) 로드. 없으면 []. */
export function readVoiceManifest(projectId) {
  const p = resolve(__dirname, "../data/voice", slug(projectId) + ".json")
  if (!existsSync(p)) return []
  try { return JSON.parse(readFileSync(p, "utf8")).segs || [] } catch { return [] }
}

/** 음성 잡 요약 목록(잡 센터용). 최신순. */
export function listVoiceJobs() {
  return [...jobs.values()]
    .map((j) => ({ kind: "voice", jobId: j.jobId, projectId: j.projectId, status: j.status, progress: j.progress, engine: j.engine, voice: j.voice, done: j.done, total: j.total, startedAt: j.createdAt, error: j.error }))
    .sort((a, b) => String(b.startedAt || "").localeCompare(String(a.startedAt || "")))
}

/** remotion/public/audio 하위 파일 스트리밍(생성 오디오 재생용). f는 audio 기준 상대경로. */
export function audioFile(f) {
  const base = resolve(__dirname, "../../remotion/public/audio")
  const p = resolve(base, f || "")
  if (!p.startsWith(base) || !existsSync(p)) return null
  return { path: p, size: statSync(p).size, stream: () => createReadStream(p) }
}

const THUMBS_DIR = resolve(__dirname, "../../remotion/public/thumbs")

/**
 * 생성된 썸네일 목록. projectId 주면 그 프로젝트 전용 생성물(thumb-<slug>-*)만 반환.
 * 프로젝트 전용이 없으면 빈 목록(주제 다른 옛 스톡은 감춤 → "생성하세요" 유도).
 */
export function listThumbs(projectId) {
  if (!existsSync(THUMBS_DIR)) return []
  try {
    const all = readdirSync(THUMBS_DIR).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).sort()
    if (!projectId) return all
    const slug = String(projectId).replace(/[^\w.-]/g, "_")
    return all.filter((f) => f.startsWith(`thumb-${slug}-`))
  } catch { return [] }
}

/** 썸네일 파일 스트리밍. f는 thumbs 기준 파일명. */
export function thumbFile(f) {
  const p = resolve(THUMBS_DIR, f || "")
  if (!p.startsWith(THUMBS_DIR) || !existsSync(p)) return null
  const type = /\.png$/i.test(p) ? "image/png" : /\.webp$/i.test(p) ? "image/webp" : "image/jpeg"
  return { path: p, size: statSync(p).size, type, stream: () => createReadStream(p) }
}
