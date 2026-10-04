import { spawn } from "node:child_process"
import { existsSync, mkdirSync, copyFileSync, writeFileSync, statSync, readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve, join } from "node:path"
import { upsertJob } from "./job-store.mjs"

const snap = (j) => ({ kind: "render", jobId: j.jobId, projectId: j.projectId, status: j.status, progress: j.progress, phase: j.phase, startedAt: j.startedAt, bytes: j.out?.bytes || 0, error: j.error })

const __dirname = dirname(fileURLToPath(import.meta.url))
const REMOTION_DIR = resolve(__dirname, "../../remotion")
const PUBLISHED_DIR = resolve(__dirname, "../data/published")
const REMOTION_BIN = join(REMOTION_DIR, "node_modules/.bin/remotion")

const slug = (projectId) => String(projectId || "video").replace(/[^\w.-]/g, "_")
/** 프로젝트별 렌더 출력 경로. projectId 없으면 레거시 video.mp4. */
const outPath = (projectId) => join(REMOTION_DIR, "out", (projectId ? slug(projectId) : "video") + ".mp4")

/**
 * 렌더/발행 실행. Node 서버에서 실제 프로세스를 돌린다(MCP 불필요).
 * - render: remotion render 서브프로세스, stdout 파싱해 진행률 갱신
 * - publish: 렌더된 MP4 + 메타데이터 + 썸네일을 published/<project>/ 번들로 산출(업로드는 수동)
 */

const jobs = new Map() // jobId -> { status, progress, phase, out, error, startedAt }
let seq = 0

const RENDER_RE = /(\d+)\s*\/\s*(\d+)/ // "Rendered 120/300" 류

/** 렌더 시작 → jobId 반환. 비동기로 진행. 프로젝트별 out/<slug>.mp4로 렌더. */
export function startRender(projectId) {
  const jobId = "r" + Date.now() + "-" + ++seq
  const mp4 = outPath(projectId)
  const relOut = "out/" + (projectId ? slug(projectId) : "video") + ".mp4"
  const job = { jobId, projectId: projectId || null, status: "running", progress: 0, phase: "부팅", out: null, outFile: mp4, error: null, startedAt: new Date().toISOString() }
  jobs.set(jobId, job)
  upsertJob(snap(job))

  if (!existsSync(REMOTION_DIR)) {
    job.status = "failed"; job.error = "remotion 디렉터리 없음: " + REMOTION_DIR
    upsertJob(snap(job))
    return jobId
  }

  const child = spawn(REMOTION_BIN, ["render", "src/index.tsx", "SubtractVideo", relOut], { cwd: REMOTION_DIR, env: process.env })
  let tail = ""
  const onData = (buf) => {
    const s = buf.toString()
    tail = (tail + s).slice(-2000)
    if (/bundl/i.test(s)) job.phase = "번들링"
    if (/render|frame/i.test(s)) job.phase = "렌더링"
    if (/encod|stitch|audio/i.test(s)) job.phase = "인코딩"
    const m = s.match(RENDER_RE)
    if (m) { const done = +m[1], total = +m[2]; if (total > 0) job.progress = Math.min(99, Math.round((done / total) * 100)) }
  }
  child.stdout.on("data", onData)
  child.stderr.on("data", onData)
  child.on("close", (code) => {
    if (code === 0 && existsSync(mp4)) {
      job.status = "done"; job.progress = 100; job.phase = "완료"
      job.out = { path: mp4, bytes: statSync(mp4).size }
    } else {
      job.status = "failed"; job.error = `remotion 종료코드 ${code}. ${tail.slice(-400)}`
    }
    upsertJob(snap(job))
  })
  child.on("error", (e) => { job.status = "failed"; job.error = String(e && e.message || e); upsertJob(snap(job)) })
  return jobId
}

export function renderStatus(jobId) {
  return jobs.get(jobId) || { error: "unknown jobId" }
}

/** 렌더 잡 요약 목록(잡 센터용). 최신순. */
export function listRenderJobs() {
  return [...jobs.values()]
    .map((j) => ({ kind: "render", jobId: j.jobId, projectId: j.projectId, status: j.status, progress: j.progress, phase: j.phase, startedAt: j.startedAt, bytes: j.out?.bytes || 0, error: j.error }))
    .sort((a, b) => String(b.startedAt || "").localeCompare(String(a.startedAt || "")))
}

/** 프로젝트별 렌더 결과 mp4 경로(존재 시). 스트리밍/발행용. */
export function renderOutput(projectId) {
  const mp4 = outPath(projectId)
  return existsSync(mp4) ? { path: mp4, bytes: statSync(mp4).size } : null
}

/**
 * 발행 준비 번들 산출. 렌더된 MP4가 있어야 함.
 * meta: { title, description, tags[], thumbnail?(remotion/public 상대경로) }
 * → published/<slug>/video.mp4 + metadata.json (+ thumbnail 복사)
 */
export function publishBundle(projectId, meta = {}) {
  const mp4 = outPath(projectId)
  if (!existsSync(mp4)) return { ok: false, error: "이 프로젝트의 렌더된 영상 없음 — 먼저 렌더하세요" }
  const dir = join(PUBLISHED_DIR, slug(projectId))
  mkdirSync(dir, { recursive: true })

  copyFileSync(mp4, join(dir, "video.mp4"))

  // 썸네일 복사(선택): remotion/public 하위 경로
  let thumbOut = null
  if (meta.thumbnail) {
    const src = join(REMOTION_DIR, "public", meta.thumbnail)
    if (existsSync(src)) { const name = "thumbnail" + (meta.thumbnail.match(/\.\w+$/)?.[0] || ".png"); copyFileSync(src, join(dir, name)); thumbOut = name }
  }

  const metadata = {
    projectId, title: meta.title || "", description: meta.description || "",
    tags: Array.isArray(meta.tags) ? meta.tags : [],
    thumbnail: thumbOut, video: "video.mp4",
    status: "ready_to_upload", preparedAt: new Date().toISOString(),
    note: "YouTube 업로드는 수동입니다. metadata.json의 title/description/tags를 사용하세요.",
  }
  writeFileSync(join(dir, "metadata.json"), JSON.stringify(metadata, null, 2))
  return { ok: true, dir, files: readdirSync(dir), metadata }
}
