import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, createReadStream, statSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve, join, basename } from "node:path"

// 영상에 실제로 들어가는 비주얼 소스(세그먼트별 B-roll + 뒷배경) 관리.
// - B-roll 파일: remotion/public/assets/<파일명>  → 매니페스트 broll = 파일명 (staticFile(`assets/${broll}`))
// - 뒷배경   : remotion/public/ 하위 경로       → style.bgImage = "assets/<파일명>" (staticFile(bgImage))
// - 배정 오버라이드: data/assets/<slug>.json     → { background, segments:{idx:file}, updatedAt }
// - Higgs 생성 요청 큐: data/asset-requests/<id>.json (Node는 MCP 호출 불가 → Claude 세션이 처리)

const __dirname = dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = resolve(__dirname, "../../remotion/public")
const ASSETS_DIR = join(PUBLIC_DIR, "assets")
const MAP_DIR = resolve(__dirname, "../data/assets")
const REQ_DIR = resolve(__dirname, "../data/asset-requests")

const IMG_RE = /\.(png|jpe?g|webp)$/i
const slug = (projectId) => String(projectId || "default").replace(/[^\w.-]/g, "_")
const ensure = (d) => { if (!existsSync(d)) mkdirSync(d, { recursive: true }) }
const now = () => new Date().toISOString()

const EXT_BY_MIME = { "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg", "image/webp": "webp" }

/** data URL 또는 {base64, ext} → 버퍼+확장자. 실패 시 throw. */
function decodeImage(input) {
  if (typeof input === "string" && input.startsWith("data:")) {
    const m = input.match(/^data:([^;]+);base64,(.*)$/s)
    if (!m) throw new Error("잘못된 data URL")
    const ext = EXT_BY_MIME[m[1].toLowerCase()]
    if (!ext) throw new Error("지원하지 않는 이미지 형식: " + m[1])
    return { buf: Buffer.from(m[2], "base64"), ext }
  }
  if (input && input.base64) {
    const ext = (input.ext || "png").replace(/[^a-z0-9]/gi, "").toLowerCase()
    if (!/^(png|jpe?g|webp)$/.test(ext)) throw new Error("지원하지 않는 확장자")
    return { buf: Buffer.from(input.base64, "base64"), ext: ext === "jpeg" ? "jpg" : ext }
  }
  throw new Error("이미지 데이터가 없습니다")
}

/** assets/ 하위 이미지 풀(파일명 목록). */
export function assetPool() {
  ensure(ASSETS_DIR)
  try { return readdirSync(ASSETS_DIR).filter((f) => IMG_RE.test(f)).sort() } catch { return [] }
}

const mapPath = (projectId) => join(MAP_DIR, slug(projectId) + ".json")

/** 프로젝트 배정 오버라이드 로드({ background, segments }). */
export function loadAssetMap(projectId) {
  const p = mapPath(projectId)
  if (!existsSync(p)) return { background: null, segments: {} }
  try { const m = JSON.parse(readFileSync(p, "utf8")); return { background: m.background ?? null, segments: m.segments || {} } }
  catch { return { background: null, segments: {} } }
}

function saveAssetMap(projectId, map) {
  ensure(MAP_DIR)
  writeFileSync(mapPath(projectId), JSON.stringify({ projectId, ...map, updatedAt: now() }, null, 2))
  return map
}

/** 현재 배정 상태 요약(스튜디오 패널용). segments 오버라이드 + 풀 + 배경. */
export function listAssets(projectId) {
  const map = loadAssetMap(projectId)
  return { projectId, background: map.background, segments: map.segments, pool: assetPool() }
}

/** 업로드 저장. target: {segIdx} | {background:true} | {pool:true}. → { file, url } */
export function saveUpload(projectId, target, imageInput) {
  const { buf, ext } = decodeImage(imageInput)
  ensure(ASSETS_DIR)
  const tag = target && target.background ? "bg" : target && target.segIdx != null ? "seg-" + String(target.segIdx).padStart(2, "0") : "pool"
  const file = `up-${slug(projectId)}-${tag}-${Date.now()}.${ext}`
  writeFileSync(join(ASSETS_DIR, file), buf)
  const map = loadAssetMap(projectId)
  if (target && target.background) map.background = "assets/" + file
  else if (target && target.segIdx != null) map.segments = { ...map.segments, [String(target.segIdx)]: file }
  saveAssetMap(projectId, map)
  return { file, url: "assets/" + file }
}

/** 세그먼트에 풀의 기존 파일 배정(또는 null로 해제). */
export function assignSegment(projectId, segIdx, file) {
  const map = loadAssetMap(projectId)
  const segs = { ...map.segments }
  if (file && assetPool().includes(file)) segs[String(segIdx)] = file
  else delete segs[String(segIdx)]
  return saveAssetMap(projectId, { ...map, segments: segs })
}

/** 뒷배경 지정. file: 'assets/x.png'(풀 파일명 또는 상대경로) 또는 null(해제). */
export function setBackground(projectId, file) {
  const map = loadAssetMap(projectId)
  let bg = null
  if (file) bg = file.startsWith("assets/") || file.includes("/") ? file : "assets/" + file
  return saveAssetMap(projectId, { ...map, background: bg })
}

// ── Higgs 생성 요청 큐 (Node→MCP 불가 브리지) ──
let reqSeq = 0
const reqPath = (id) => join(REQ_DIR, id + ".json")

/** 세그먼트 이미지 생성 요청 등록. Claude 세션이 pending을 읽어 Higgs로 처리. → {id, status} */
export function queueGenerate(projectId, segIdx, prompt) {
  ensure(REQ_DIR)
  const id = "g" + Date.now() + "-" + ++reqSeq
  const rec = { id, projectId, segIdx, prompt: String(prompt || "").slice(0, 1200), status: "pending", file: null, error: null, createdAt: now(), resolvedAt: null }
  writeFileSync(reqPath(id), JSON.stringify(rec, null, 2))
  return { id, status: "pending" }
}

export function generateStatus(id) {
  const p = reqPath(String(id || ""))
  if (!existsSync(p)) return { error: "unknown id" }
  try { return JSON.parse(readFileSync(p, "utf8")) } catch { return { error: "read fail" } }
}

/** 미처리 생성 요청 목록(Claude 세션 브리지용). */
export function pendingGenerations() {
  ensure(REQ_DIR)
  try {
    return readdirSync(REQ_DIR).filter((f) => f.endsWith(".json"))
      .map((f) => { try { return JSON.parse(readFileSync(join(REQ_DIR, f), "utf8")) } catch { return null } })
      .filter((r) => r && r.status === "pending")
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
  } catch { return [] }
}

/**
 * 생성 요청 해소. Claude 세션이 Higgs로 만든 이미지를 넘긴다.
 * image: data URL/{base64,ext}(파일 저장) 또는 { file } (이미 assets/에 있는 파일명).
 */
export function resolveGeneration(id, image) {
  const p = reqPath(String(id || ""))
  if (!existsSync(p)) throw new Error("unknown id")
  const rec = JSON.parse(readFileSync(p, "utf8"))
  ensure(ASSETS_DIR)
  let file
  if (image && image.file && assetPool().includes(image.file)) {
    file = image.file
  } else {
    const { buf, ext } = decodeImage(image)
    file = `gen-${slug(rec.projectId)}-seg-${String(rec.segIdx).padStart(2, "0")}-${Date.now()}.${ext}`
    writeFileSync(join(ASSETS_DIR, file), buf)
  }
  const map = loadAssetMap(rec.projectId)
  saveAssetMap(rec.projectId, { ...map, segments: { ...map.segments, [String(rec.segIdx)]: file } })
  const done = { ...rec, status: "done", file, resolvedAt: now() }
  writeFileSync(p, JSON.stringify(done, null, 2))
  return done
}

export function failGeneration(id, error) {
  const p = reqPath(String(id || ""))
  if (!existsSync(p)) return
  try { const rec = JSON.parse(readFileSync(p, "utf8")); writeFileSync(p, JSON.stringify({ ...rec, status: "failed", error: String(error || "").slice(0, 300), resolvedAt: now() }, null, 2)) } catch {}
}

/** assets/ 하위 이미지 스트리밍(미리보기). f는 'assets/x.png' 또는 'x.png'. */
export function assetFile(f) {
  const name = basename(String(f || "").replace(/^assets\//, ""))
  const p = join(ASSETS_DIR, name)
  if (!p.startsWith(ASSETS_DIR) || !existsSync(p) || !IMG_RE.test(p)) return null
  const type = /\.png$/i.test(p) ? "image/png" : /\.webp$/i.test(p) ? "image/webp" : "image/jpeg"
  return { path: p, size: statSync(p).size, type, stream: () => createReadStream(p) }
}
