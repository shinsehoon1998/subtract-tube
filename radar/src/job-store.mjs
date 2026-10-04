import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve, join } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIR = resolve(__dirname, "../data")
const FILE = join(DIR, "jobs.json")
const MAX = 200 // 최근 N개만 보관

/** 잡 영속화. 렌더·음성 잡의 시작·종료를 디스크에 기록해 재시작에도 이력 보존. */

function readAll() {
  if (!existsSync(FILE)) return []
  try { return JSON.parse(readFileSync(FILE, "utf8")) || [] } catch { return [] }
}
function writeAll(arr) {
  mkdirSync(DIR, { recursive: true })
  writeFileSync(FILE, JSON.stringify(arr.slice(-MAX), null, 2))
}

/** 잡 요약 upsert(jobId 기준). rec: { kind, jobId, ... } */
export function upsertJob(rec) {
  if (!rec || !rec.jobId) return
  const arr = readAll()
  const i = arr.findIndex((x) => x.jobId === rec.jobId)
  if (i >= 0) arr[i] = { ...arr[i], ...rec }
  else arr.push(rec)
  writeAll(arr)
}

/** 영속 잡 이력 전체(최신순). */
export function loadPersistedJobs() {
  return readAll().sort((a, b) => String(b.startedAt || "").localeCompare(String(a.startedAt || "")))
}

/** 부팅 복구: 'running' 상태였던 잡은 서버 재시작으로 중단됐으므로 실패 처리. */
export function reconcileOnBoot() {
  const arr = readAll()
  let n = 0
  for (const j of arr) {
    if (j.status === "running") { j.status = "failed"; j.error = "서버 재시작으로 중단됨"; j.progress = j.progress || 0; n++ }
  }
  if (n) writeAll(arr)
  return n
}
