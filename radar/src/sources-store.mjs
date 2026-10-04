import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { parse as parseYaml, stringify as stringifyYaml } from "yaml"

// radar-sources.yaml의 카테고리별 지정 채널을 읽고/저장한다.
// UI 채널 편집·수집이 이 파일에 반영돼야 스케줄러·폴백이 올바른 채널을 쓴다.
// (도입부에 엉뚱한 채널이 수집되던 원인: UI 편집이 여기 저장되지 않아 옛 하드코딩값을 계속 사용)

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(__dirname, "../config/radar-sources.yaml")

const VALID_REF = (r) => typeof r === "string" && (/^UC[\w-]{10,}$/.test(r) || /^@[\w.-]+$/.test(r) || /youtube\.com|youtu\.be/.test(r))

export function readSources() {
  try { return parseYaml(readFileSync(SRC, "utf8")) || { categories: {} } } catch { return { categories: {} } }
}

/** 카테고리별 지정 채널 목록 반환({topic:[refs], hook:[refs], ...}). */
export function sourceChannels() {
  const s = readSources()
  const out = {}
  for (const [k, v] of Object.entries(s.categories || {})) out[k] = Array.isArray(v.channels) ? v.channels : []
  return out
}

/**
 * 한 카테고리의 지정 채널을 저장(collectable ref만: UC/@/URL).
 * viewtrap 전용(title_thumb 등 channels 없는) 카테고리는 무시.
 * @returns {string[]} 저장된 refs
 */
export function writeCategoryChannels(category, refs) {
  const clean = [...new Set((refs || []).filter(VALID_REF))]
  const s = readSources()
  s.categories = s.categories || {}
  const cat = s.categories[category]
  if (!cat) return []                       // 정의 안 된 카테고리는 생성하지 않음
  if (!("channels" in cat) && cat.method && !String(cat.method).includes("channel")) return [] // 순수 viewtrap
  s.categories[category] = { ...cat, channels: clean }
  writeFileSync(SRC, stringifyYaml(s))
  return clean
}
