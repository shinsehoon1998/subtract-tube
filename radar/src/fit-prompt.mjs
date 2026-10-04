import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function channelProfile() {
  const p = resolve(__dirname, "../../config/channel-profile.md");
  return existsSync(p) ? readFileSync(p, "utf8") : "(채널 프로파일 없음)";
}

/** 적합도 채점 프롬프트 — `claude -p` 입력용. JSON 배열로만 응답하도록 강제. */
export function fitPrompt(candidates) {
  const profile = channelProfile();
  const list = candidates
    .map((c, i) => `${i + 1}. [${c.channelTitle}] ${c.title}\n   조회수 ${c.viewCount} · 구독자 ${c.subscriberCount} · ${c.url}`)
    .join("\n");
  return [
    "다음은 우리 채널 프로파일이다(0단계 산출):",
    "",
    profile,
    "",
    "---",
    "",
    '아래 해외 후보 영상이 "우리 구독자·잠재고객에게 얼마나 적합한지"를 채점하라.',
    "각 영상에 audience_fit / theme_fit / borrowability 를 0~100으로 매기고, off_limits 충돌 시 크게 감점하라.",
    "fit = round(audience_fit*0.5 + theme_fit*0.3 + borrowability*0.2).",
    "",
    "후보:",
    list,
    "",
    "각 영상의 영어 제목을 자연스러운 한국어 제목으로 번역해 ko에 넣어라.",
    '반드시 JSON 배열로만 출력(설명/마크다운 금지): [{"n":1,"ko":"한국어 번역 제목","audience_fit":0,"theme_fit":0,"borrowability":0,"fit":0,"reason":"한 줄 근거"}]',
  ].join("\n");
}

// CLI: 후보 JSON → 채점 프롬프트를 stdout으로 (예: node src/fit-prompt.mjs data/candidates-X.json | claude -p > data/fit.json)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const p = process.argv[2];
  if (!p) { console.error("usage: node src/fit-prompt.mjs <candidates.json>"); process.exit(1); }
  const wrap = JSON.parse(readFileSync(p, "utf8"));
  const candidates = Array.isArray(wrap) ? wrap : wrap.candidates || [];
  process.stdout.write(fitPrompt(candidates));
}
