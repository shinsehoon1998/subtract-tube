import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** 아주 가벼운 .env 파서 (dotenv 의존성 없이). KEY=VALUE, 따옴표/주석 처리. */
function parseDotenv(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (/^\s*#/.test(line) || !line.includes("=")) continue;
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    } else {
      v = v.replace(/\s+#.*$/, "").trim(); // 따옴표 없는 값의 인라인 주석 제거
    }
    out[m[1]] = v;
  }
  return out;
}

/**
 * 자격증명 병합 로드. 우선순위: process.env > radar/.env > 빼기연구소/.env
 * - YOUTUBE_API_KEY 등은 리포 루트 .env(빼기연구소/.env) 재사용
 * - NOTION_TOKEN 등 radar 전용은 radar/.env
 */
export function loadEnv() {
  const repoEnv = resolve(__dirname, "../../../../.env"); // 빼기연구소/.env
  const localEnv = resolve(__dirname, "../../.env"); // radar/.env
  return { ...parseDotenv(repoEnv), ...parseDotenv(localEnv), ...process.env };
}
