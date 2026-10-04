import { execFile } from "node:child_process"
import { readFileSync, mkdtempSync, rmSync, readdirSync, existsSync, unlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
const exec = promisify(execFile)
const COOKIE_FILE = join(tmpdir(), "yt-cookies.txt")
let cookieReady = null

async function cookieArgs(refresh) {
  if (refresh) { try { unlinkSync(COOKIE_FILE) } catch {} cookieReady = null }
  if (existsSync(COOKIE_FILE)) return ["--cookies", COOKIE_FILE]
  if (!cookieReady) cookieReady = exec("python3", ["-m", "yt_dlp", "--cookies-from-browser", "chrome", "--cookies", COOKIE_FILE, "--skip-download", "https://www.youtube.com/watch?v=8QQ_INxAhRs"], { timeout: 90000 }).catch(() => {})
  await cookieReady
  return existsSync(COOKIE_FILE) ? ["--cookies", COOKIE_FILE] : ["--cookies-from-browser", "chrome"]
}

/** 자막 추출. 실패 시 쿠키 새로 추출해 1회 재시도(만료 자가치유). en/ko 우선. */
export async function fetchTranscript(videoId) {
  for (const refresh of [false, true]) {
    const dir = mkdtempSync(join(tmpdir(), "tx-"))
    try {
      const ck = await cookieArgs(refresh)
      await exec("python3", ["-m", "yt_dlp", ...ck, "--skip-download", "--write-auto-sub", "--write-sub", "--sub-lang", "en.*,ko.*,en,ko", "--sub-format", "vtt", "-o", join(dir, "%(id)s.%(ext)s"), `https://www.youtube.com/watch?v=${videoId}`], { timeout: 90000 })
      const vtt = readdirSync(dir).find((f) => f.endsWith(".vtt"))
      if (vtt) { const txt = vttToText(readFileSync(join(dir, vtt), "utf8")); if (txt) return txt }
    } catch {} finally { try { rmSync(dir, { recursive: true, force: true }) } catch {} }
  }
  return null
}
function vttToText(vtt) {
  const out = []
  for (const raw of vtt.split("\n")) {
    if (!raw || /^WEBVTT|-->|^\d+$|^Kind:|^Language:|^NOTE/.test(raw)) continue
    const t = raw.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim()
    if (t && out[out.length - 1] !== t) out.push(t)
  }
  return out.join(" ").replace(/\s+/g, " ").trim() || null
}
