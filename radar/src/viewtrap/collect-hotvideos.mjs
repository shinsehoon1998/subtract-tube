// [브라우저 제어 / 2·4단계] 뷰트랩 핫비디오 수집 — Playwright (실제 Chrome)
// 뷰트랩은 공개 API가 없어 "로그인 세션 + DOM 스크레이핑"으로만 가능. 로그인=OAuth(카카오/구글).
//
// 사용:
//   node src/viewtrap/collect-hotvideos.mjs --login                 # 최초 로그인(창)
//   node src/viewtrap/collect-hotvideos.mjs --inspect [--keyword=..] # 헤드 ON 통합 검증(세션 없으면 그 자리서 로그인 후 수집)
//   node src/viewtrap/collect-hotvideos.mjs --keyword="herk ai"      # 수집 → data/viewtrap-<date>.json
//
// 셀렉터: 클래스 비의존. 카드 = "구독자+기여도+성과도" 텍스트를 동시에 가진 최소 컨테이너.
// videoId 는 썸네일 ytimg.com/vi/<id> 에서 복원. 등급은 카드 내 등급토큰 순서(기여도, 성과도)로 매핑.
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILE = resolve(__dirname, "../../.viewtrap-profile");
const DATA = resolve(__dirname, "../../data");
const SEARCH_URL = "https://app.viewtrap.com/video-search";
const GRADES = ["Worst", "Bad", "Normal", "Good", "Great"];
const gradeAtLeast = (g, min) => g != null && GRADES.indexOf(g) >= GRADES.indexOf(min);

function extractCardsInPage() {
  const parseKNum = (s) => {
    if (!s) return null;
    s = String(s).replace(/,/g, "").trim();
    let m = s.match(/([\d.]+)\s*만/); if (m) return Math.round(parseFloat(m[1]) * 10000);
    m = s.match(/([\d.]+)\s*천/); if (m) return Math.round(parseFloat(m[1]) * 1000);
    m = s.match(/([\d.]+)/); return m ? Math.round(parseFloat(m[1])) : null;
  };
  const isCard = (el) => {
    const t = el.innerText || "";
    return /구독자/.test(t) && /기여도/.test(t) && /성과도/.test(t);
  };
  const nodes = Array.from(document.querySelectorAll("div, li, article"));
  const cards = nodes.filter((el) => isCard(el) && !Array.from(el.querySelectorAll("div,li,article")).some(isCard));
  return cards.map((el) => {
    const text = el.innerText || "";
    const img = el.querySelector('img[src*="ytimg.com/vi/"]') || el.querySelector("img");
    const src = img ? img.getAttribute("src") || "" : "";
    const idm = src.match(/ytimg\.com\/vi\/([\w-]{6,})\//);
    const videoId = idm ? idm[1] : "";
    const grades = text.match(/(Worst|Bad|Normal|Good|Great)/g) || [];
    const viewsM = text.match(/조회수\s*([\d.,]+\s*[만천]?)/);
    const subsM = text.match(/구독자\s*([\d.,]+\s*[만천]?)/);
    const dateM = text.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
    const lines = text.split("\n").map((s) => s.trim()).filter(Boolean);
    const title = lines.find((l) => l.length > 6 && !/조회수|구독자|기여도|성과도|노출|총 영상|게시일|선택|Normal|Good|Great|Bad|Worst/.test(l)) || lines[0] || "";
    return {
      title,
      videoId,
      url: videoId ? "https://www.youtube.com/watch?v=" + videoId : "",
      viewCount: parseKNum(viewsM && viewsM[1]),
      subscriberCount: parseKNum(subsM && subsM[1]),
      publishedAt: dateM ? dateM[1] + "-" + String(dateM[2]).padStart(2, "0") + "-" + String(dateM[3]).padStart(2, "0") : null,
      contribution: grades[0] || null,
      performance: grades[1] || null,
      thumbnail: src.startsWith("http") ? src : "",
    };
  });
}

async function open(headless) {
  mkdirSync(PROFILE, { recursive: true });
  mkdirSync(DATA, { recursive: true });
  const base = {
    headless,
    viewport: { width: 1500, height: 900 },
    ignoreDefaultArgs: ["--enable-automation"], // 자동화 배너 제거(구글 OAuth 차단 회피)
    args: ["--disable-blink-features=AutomationControlled", "--no-first-run", "--no-default-browser-check"],
  };
  let ctx;
  try {
    ctx = await chromium.launchPersistentContext(PROFILE, { ...base, channel: "chrome" });
  } catch {
    ctx = await chromium.launchPersistentContext(PROFILE, base);
  }
  const page = ctx.pages()[0] || (await ctx.newPage());
  return { ctx, page };
}

async function isLoginWall(page) {
  if (/login|signin|auth/i.test(page.url())) return true;
  if ((await page.locator('input[type="password"]').count().catch(() => 0)) > 0) return true;
  const loginBtns = await page.getByText(/카카오.*로그인|Google 계정으로 로그인|회원가입/).count().catch(() => 0);
  const searchUi = await page.getByPlaceholder(/단어 또는 문장/).count().catch(() => 0);
  return loginBtns > 0 && searchUi === 0;
}

async function isAuthed(page) {
  // 긍정 신호: 검색창 존재 = 앱 인증됨 (로딩 중 오판 방지)
  return (await page.getByPlaceholder(/단어 또는 문장/).count().catch(() => 0)) > 0;
}

async function waitForAuth(page, maxMs = 5 * 60 * 1000) {
  try {
    if (await isAuthed(page)) return true;
    console.error("로그인 필요 — 열린 창에서 로그인 완료까지 대기(최대 5분). 창을 닫지 마세요.");
    const deadline = Date.now() + maxMs;
    while (Date.now() < deadline) {
      await page.waitForTimeout(2500);
      if (await isAuthed(page)) return true;
    }
    return false;
  } catch {
    console.error("창이 닫혔습니다 — 로그인 미완료.");
    return false;
  }
}

async function gotoHotVideos(page, keyword) {
  await page.getByText(/핫\s*비디오/).first().click({ timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(2000);
  if (keyword) {
    await page.getByPlaceholder(/단어 또는 문장/).fill(keyword).catch(() => {});
    await page.keyboard.press("Enter").catch(() => {});
    await page.waitForTimeout(2500);
  }
}

export async function loginFlow() {
  const { ctx, page } = await open(false);
  await page.goto(SEARCH_URL, { waitUntil: "domcontentloaded" }).catch(() => {});
  const ok = await waitForAuth(page);
  await ctx.close().catch(() => {});
  console.error(ok ? "✅ 로그인 확인 — 세션 저장 → .viewtrap-profile/" : "❌ 로그인 미완료. 다시 시도하세요.");
}

export async function collectHotVideos({ keyword = "", minGrade = "Good", limit = 30, headless = false, scrolls = 6, waitLogin = true } = {}) {
  const { ctx, page } = await open(headless);
  await page.goto(SEARCH_URL, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(2500);
  let authed = await isAuthed(page);
  if (!authed && waitLogin) authed = await waitForAuth(page);
  if (authed) await gotoHotVideos(page, keyword);
  for (let i = 0; i < scrolls && authed; i++) {
    await page.mouse.wheel(0, 4000).catch(() => {});
    await page.waitForTimeout(1100);
  }
  const raw = authed ? await page.evaluate(extractCardsInPage) : [];
  const screenshot = resolve(DATA, "viewtrap-inspect.png");
  await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {});
  await ctx.close();
  const candidates = raw
    .filter((v) => v.url)
    .filter((v) => !v.performance || (gradeAtLeast(v.contribution, minGrade) && gradeAtLeast(v.performance, minGrade)))
    .map((v) => ({ ...v, source: "viewtrap", step: 2 }))
    .sort((a, b) => (a.subscriberCount ?? 1e12) - (b.subscriberCount ?? 1e12))
    .slice(0, limit);
  return { authed, rawCount: raw.length, screenshot, candidates };
}

// [Plan B] 이미 로그인된 실제 Chrome에 CDP로 붙어 수집 (구글 로그인 불필요·탐지 없음)
// 사전: Chrome 완전 종료 후 아래로 재기동(평소 프로필 = 뷰트랩 로그인 유지):
//   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
export async function collectViaCDP({ keyword = "", minGrade = "Good", limit = 30, scrolls = 6, port = 9222 } = {}) {
  mkdirSync(DATA, { recursive: true });
  const browser = await chromium.connectOverCDP("http://localhost:" + port);
  const ctx = browser.contexts()[0] || (await browser.newContext());
  const page = ctx.pages()[0] || (await ctx.newPage());
  await page.goto(SEARCH_URL, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(2500);
  const authed = await isAuthed(page);
  if (authed) await gotoHotVideos(page, keyword);
  for (let i = 0; i < scrolls && authed; i++) {
    await page.mouse.wheel(0, 4000).catch(() => {});
    await page.waitForTimeout(1100);
  }
  const raw = authed ? await page.evaluate(extractCardsInPage) : [];
  const screenshot = resolve(DATA, "viewtrap-inspect.png");
  await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {});
  await browser.close().catch(() => {}); // CDP 연결만 해제 — 실제 Chrome은 안 닫힘
  const candidates = raw
    .filter((v) => v.url)
    .filter((v) => !v.performance || (gradeAtLeast(v.contribution, minGrade) && gradeAtLeast(v.performance, minGrade)))
    .map((v) => ({ ...v, source: "viewtrap", step: 2 }))
    .sort((a, b) => (a.subscriberCount ?? 1e12) - (b.subscriberCount ?? 1e12))
    .slice(0, limit);
  return { authed, rawCount: raw.length, screenshot, candidates };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const login = process.argv.includes("--login");
  const inspect = process.argv.includes("--inspect");
  const cdp = process.argv.includes("--cdp");
  const kw = (process.argv.find((a) => a.startsWith("--keyword=")) || "").split("=")[1] || "";

  if (login) {
    await loginFlow();
  } else {
    const res = cdp ? await collectViaCDP({ keyword: kw }) : await collectHotVideos({ keyword: kw, headless: false });
    if (!res.authed) console.error("⚠️ 로그인 미완료 — 다시 시도하세요.");
    console.error(`원시 카드 ${res.rawCount}건 · 필터후 ${res.candidates.length}건 · 스크린샷 ${res.screenshot}`);
    if (inspect) {
      console.error("샘플:", JSON.stringify(res.candidates.slice(0, 3), null, 2));
    } else if (res.authed) {
      const out = resolve(DATA, `viewtrap-${new Date().toISOString().slice(0, 10)}.json`);
      writeFileSync(out, JSON.stringify({ collected_at: new Date().toISOString(), count: res.candidates.length, candidates: res.candidates }, null, 2));
      console.error(`적재 → ${out}`);
    }
  }
}
