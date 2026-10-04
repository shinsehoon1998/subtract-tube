import { config, higgsfield } from "@higgsfield/client/v2"
import { NotEnoughCreditsError } from "@higgsfield/client"
import { loadEnv } from "./lib/env.mjs"

// Higgsfield 직접 API(이미지 생성). Node에서 MCP 없이 독립 동작.
// v2 subscribe → V2Response { status, images:[{url}] }. 크레딧 부족은 NotEnoughCreditsError.

let configured = false
function ensureConfig() {
  if (configured) return
  const e = loadEnv()
  if (!e.HIGGSFIELD_API_KEY || !e.HIGGSFIELD_API_SECRET) throw new Error("HIGGSFIELD_API_KEY/SECRET 미설정")
  config({ apiKey: e.HIGGSFIELD_API_KEY, apiSecret: e.HIGGSFIELD_API_SECRET })
  configured = true
}

// flux = 텍스트(한글 포함)에 강한 text-to-image. v2 subscribe는 input을 그대로 전송.
const DEFAULT_ENDPOINT = "flux-pro/kontext/max/text-to-image"

/** jobSet(다양한 SDK 응답 형태)에서 결과 이미지 URL 추출. */
function extractUrl(res) {
  if (!res) return null
  const job = res.jobs && res.jobs[0]
  return (job && job.results && (job.results.raw?.url || job.results.min?.url))
    || (res.images && res.images[0] && res.images[0].url)
    || null
}

/**
 * 텍스트 프롬프트 → 이미지 생성 → 다운로드 버퍼.
 * @returns {Promise<{buf: Buffer, url: string, ext: string}>}
 * @throws {Error} 크레딧 부족 시 message에 "크레딧" 포함.
 */
export async function generateImage(prompt, opts = {}) {
  ensureConfig()
  const endpoint = opts.endpoint || DEFAULT_ENDPOINT
  const input = {
    prompt: String(prompt || "").slice(0, 1800),
    aspect_ratio: opts.aspect || "16:9",
    safety_tolerance: opts.safety ?? 2,
    ...(opts.input || {}),
  }
  let res
  try {
    res = await higgsfield.subscribe(endpoint, { input, withPolling: true })
  } catch (e) {
    if (e instanceof NotEnoughCreditsError) throw new Error("Higgsfield 크레딧 부족 — 직접 API 계정 충전 필요")
    throw new Error("Higgs 생성 실패: " + String((e && e.message) || e).slice(0, 200))
  }
  const status = res.status || (res.isCompleted ? "completed" : res.isFailed ? "failed" : res.isNsfw ? "nsfw" : "")
  if (status && status !== "completed") throw new Error("Higgs 상태=" + status + (status === "nsfw" ? " (프롬프트 차단)" : ""))
  const url = extractUrl(res)
  if (!url) throw new Error("Higgs 결과 이미지 없음")
  const r = await fetch(url)
  if (!r.ok) throw new Error("이미지 다운로드 실패 " + r.status)
  const buf = Buffer.from(await r.arrayBuffer())
  const ext = /\.png(\?|$)/i.test(url) ? "png" : /\.webp(\?|$)/i.test(url) ? "webp" : "jpg"
  return { buf, url, ext }
}
