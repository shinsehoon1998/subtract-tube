// 1회용 파이프라인 러너: 메타 공식 MCP 원고(18세그, 모션/목업/정적 하이브리드) → 음성 → 조립 → 렌더.
// 실행: node src/_pipeline.mjs
import { startVoiceGen, voiceStatus } from "./generate.mjs"
import { buildManifest } from "./assemble.mjs"
import { startRender, renderStatus } from "./produce.mjs"

const projectId = "meta-ads-mcp"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

const row = (label, num, prefix = "", suffix = "") => ({ label, num, prefix, suffix })
const S = (name, rows, extra = {}) => ({ name, rows, ...extra })

const SCRIPT = { segments: [
  { idx: 1, broll: "gfx-ban.png",
    narration: "클로드로 메타 광고 자동화, 요즘 영상 많죠. 근데 그대로 따라 하다가 광고 계정 정지된 분들이 있습니다. 실제로 해외 회사 하나는 계정을 통째로 날렸어요. 계정이 멈추면, 매출도 같이 멈춥니다." },
  { idx: 2, motion: { type: "checklist", data: { title: "오늘 가져갈 것", items: ["공식 연결법 5분", "실전 활용 5가지", "마지막, 함정 1개"] } },
    narration: "안녕하세요, 빼기연구소 신대표입니다. 이제 위험하게 돌아갈 필요 없어요. 메타가 공식 MCP를 열었거든요. 아직 발 빠른 실무자들만 조용히 갈아타는 단계입니다. 오늘 오 분 연결법이랑, 제가 직접 돌려본 활용 다섯 가지, 매주 몇 시간짜리 보고서가 한 줄로 줄어듭니다. 그리고 절반은 겪는 함정 하나는, 마지막에요. 자, 편하게 보시죠." },
  { idx: 3, broll: "gfx-key.png",
    narration: "시작 전에, 왜 계정이 날아갔는지 삼십 초만 볼게요. 솔직히 저도 처음엔, MCP면 다 같은 MCP인 줄 알았어요. 근데 사고 난 케이스들을 뜯어보니까, 문제는 클로드가 아니더라고요. 열쇠였습니다. 지금까지는 개발자 계정에서 액세스 토큰이라는 열쇠를 뽑아서, 남이 만든 서버에 붙여 넣는 방식이었어요. 내 광고 계정 열쇠를 남의 집에 맡기는 거죠. 메타 입장에선 정책 위반으로 볼 여지가 있으니까, 계정이 잠긴 겁니다." },
  { idx: 4, motion: { type: "checklist", data: { title: "공식 MCP — 도구 29개", items: ["성과 보고서", "캠페인·광고 생성/수정", "상품 카탈로그 관리", "계정 건강 진단"] } },
    narration: "공식은 얘기가 다릅니다. 메타가 직접 문을 열어준 거라서요. 도구가 스물아홉 개인데, 크게 네 가지예요. 성과 보고서, 캠페인이랑 광고 만들고 수정하기, 상품 카탈로그 관리, 계정 건강 진단까지. 광고 관리자에서 마우스로 하던 일 대부분이, 채팅으로 됩니다. 그리고 이거 전부, 무료입니다." },
  { idx: 5, motion: { type: "mocksingle", data: { img: "mock-connector.png", caption: "클로드 설정 → 커스텀 커넥터 추가" } },
    narration: "자, 그럼 약속드린 오 분 연결법부터. 클로드 설정에 들어가서, 커넥터, 커스텀 커넥터 추가. 이름은 메타 광고, 아무렇게나 적으셔도 되고요. 서버 주소에 메타 공식 주소를 넣습니다. 엠씨피 점 페이스북 점 컴. 정확한 주소는 고정댓글에 걸어둘게요." },
  { idx: 6, motion: { type: "mocksingle", data: { img: "mock-fblogin.png", caption: "페이스북 로그인 → 계정 연결 범위 선택" } },
    narration: "추가를 누르면 페이스북 로그인 창이 뜹니다. 로그인하면 계정을 어떻게 연결할지 두 가지 중에 고르게 돼요. 관리하는 계정 전부 다, 아니면 골라서 하나만. 여러 계정 굴리시면 전부 연결이 편하고, 회사 계정이라 조심스러우면 하나만 고르세요." },
  { idx: 7, motion: { type: "checklist", data: { title: "도구 권한 설정", items: ["읽기 전용 = 항상 허용", "쓰기·삭제 = 확인받기", "익숙해진 뒤에 풀기"] } },
    narration: "그리고 여기서 오늘 제일 중요한 설정 하나 나갑니다. 도구 권한이에요. 다른 영상들 보면 다 항상 허용으로 두라고 해요, 빠르니까요. 근데 저는 반대로 말씀드릴게요. 읽기 전용은 항상 허용으로 두셔도 됩니다. 보기만 하니까 사고 날 게 없어요. 근데 쓰기, 삭제는요, 처음엔 꼭 확인받기로 두세요. 예산을 만지는 도구를 처음부터 풀어두는 건 리스크를 더하는 거잖아요. 참고로 공식 MCP는 광고를 만들어도 기본이 일시정지 상태로 생성돼요. 메타도 안전장치를 걸어둔 겁니다. 우리는 빼는 사람들이니까, 익숙해진 다음에 푸셔도 늦지 않습니다. 여기까지, 연결 끝. 진짜 오 분이죠." },
  { idx: 8, motion: { type: "mocksingle", data: { img: "mock-chat-campaigns.png", caption: "활용 ① 캠페인 현황, 한 줄 조회" } },
    narration: "이제 실전 다섯 가지 갑니다. 첫 번째, 제일 기본, 현황 파악. 새 채팅에 딱 한 줄. 지금 집행 중인 광고 캠페인 전부 알려줘. 광고 관리자 들어가면 캠페인, 광고 세트, 광고, 층층이 쌓여서 헷갈리잖아요. 그걸 표 하나로 정리해 줍니다." },
  { idx: 9, motion: { type: "scoreboard", data: { left: S("지난달", [row("지출", 71, "", "만원"), row("매출", 890, "", "만원"), row("로아스", 12, "", "배")]), right: S("이번달", [row("지출", 62, "", "만원"), row("매출", 1100, "", "만원"), row("로아스", 18, "", "배")], { check: true, badge: "보고서 몇 분 컷" }) } },
    narration: "두 번째, 주간 보고서. 아까 말씀드린 그 한 줄이 바로 이겁니다. 근데 AI 보고서라고 하면, 어차피 대충 요약본 나오는 거 아니야, 싶으시죠. 저도 그랬는데, 회사 보고 양식을 통째로 던져줬더니, 그 양식 그대로 채워서 나오더라고요. 이번 달 광고 성과 분석해서 보고서로 써줘. 지출 얼마, 매출 얼마, 로아스 몇 배, 지난달 비교까지 몇 분이면 끝. 포인트는 분석력이 아니라, 우리 회사 형식을 그대로 재현해 준다는 거예요. 월요일 아침 엑셀은, 이제 빼셔도 됩니다." },
  { idx: 10, motion: { type: "scoreboard", data: { left: S("베스트 소재", [row("로아스", 6.8, "", "배"), row("클릭률", 3.2, "", "%")], { check: true }), right: S("워스트 소재", [row("로아스", 0.8, "", "배"), row("클릭률", 0.6, "", "%")]) } },
    narration: "세 번째, 소재 분석. 제일 잘 나가는 소재랑 제일 안 나가는 소재 뽑아서, 개선 방향까지 제안해줘. 원래 광고 잘 아는 선배님들한테 물어보던 질문이잖아요. 팁 하나 드리면, 소재 이미지랑 영상도 같이 보여줘, 이 말을 처음부터 붙이세요. 글로만 들으면 헷갈리는데, 미리보기 링크까지 딱 붙여줍니다." },
  { idx: 11, motion: { type: "mocksingle", data: { img: "mock-adlibrary.png", caption: "활용 ④ 메타 광고 라이브러리 뒤지기" } },
    narration: "네 번째, 이게 진짜 꿀인데요. 메타 광고 라이브러리라고, 남의 회사 광고가 전부 공개돼 있는 공간이 있어요. 여기를 클로드로 뒤지는 겁니다. 교육 쪽이면, 광고 잘하기로 유명한 대형 플랫폼 하나 찍어서, 여기서 제일 오래 돌아간 소재 찾아서 분석해줘." },
  { idx: 12, motion: { type: "tally", data: { title: "교육 플랫폼 F의 소재 운영", a: { name: "전체 소재", count: 244 }, b: { name: "하루 신규", count: 7 }, note: "90일+ 장수 소재가 답안지" } },
    narration: "결과 보기 전에 하나 여쭤볼게요. 광고 잘하는 회사들은, 소재를 잘 만들어서 잘하는 걸까요? 저도 그런 줄 알았어요. 근데 데이터를 까 보니까, 잘 만드는 게 아니라, 어마어마하게 많이 만들고 있었어요. 소재가 이백사십네 개. 하루에 일곱 개꼴로 새 소재가 올라옵니다. 그러니까 광고는 한 방을 맞히는 게임이 아니라, 대량으로 테스트해서 살아남는 놈을 찾는 게임이었던 거예요. 그래서 구십 일 넘게 돌아가는 장수 소재가 답안지입니다. 석 달 넘게 돌린다는 건, 돈이 되니까 돌리는 거거든요." },
  { idx: 13, motion: { type: "mocksingle", data: { img: "mock-notion-radar.png", caption: "활용 ⑤ 광고 소재 레이더 — 매일 아침 자동" } },
    narration: "마지막 다섯 번째는 확장편. 저는 이걸 아예 자동으로 돌립니다. 클로드 코드로, 매일 아침 아홉 시에 경쟁사 광고 페이지를 쭉 긁어서, 새 소재랑 장수 소재를 노션에 정리하고, 끝나면 슬랙으로 보고까지 오게 해놨어요. 이름하여 광고 소재 레이더. 솔직히 가끔 안 돌 때도 있는데, 잘 돌 때는 아침 커피 마시면서 경쟁사 동향 정리본을 받아봅니다." },
  { idx: 14, broll: "gfx-crossroad.png",
    narration: "자, 다섯 가지 끝. 그럼 이거 누구한테 맞는 물건이냐. 메타 광고가 주력인 분들, 인스타 광고 위주 쇼핑몰, 일인 기업, 대행사 실무자분들한텐 딱입니다. 근데 구글, 틱톡, 스마트스토어까지 같이 굴리시는 분들은 이거 하나로는 부족해요. 이 MCP는 메타 담장 안만 보거든요. 채널을 묶어 보려면 서드파티 도구를 붙이거나, 클로드 코드로 직접 엮으셔야 합니다." },
  { idx: 15, broll: "gfx-rollout.png",
    narration: "그리고, 처음에 약속드린 그 함정. 지금 말씀드릴게요. 이 공식 MCP, 아직 전체 공개가 아닙니다. 미국이랑 지출이 큰 계정부터 순서대로 풀고 있어서, 한국 계정은 연결해도 엠씨피 비활성이라고 뜰 확률이 높아요. 저도 문서에 있는 기능 전부를 테스트하진 못했습니다. 안 되면 여러분 잘못이 아니에요. 연결만 해두고, 풀리면 바로 쓸 수 있게 준비해 두시면 됩니다." },
  { idx: 16, motion: { type: "checklist", data: { title: "오늘부터 할 것", items: ["공식으로 갈아타기", "읽기 전용으로 보고서 1개", "경쟁사 라이브러리 분석 1회"] } },
    narration: "그래서 오늘부터 딱 세 가지만 해보세요. 하나, 비공식 MCP 쓰고 계셨다면 오늘 끊고 공식으로 갈아타기. 계정이 재산입니다. 둘, 읽기 전용만 열어서 이번 달 보고서 하나 뽑아보기. 셋, 우리 업계에서 광고 제일 잘하는 회사 하나 찍어서 라이브러리 분석 돌려보기. 이 셋이면 오늘 영상 본전은 뽑으신 거예요." },
  { idx: 17, broll: "gfx-closing2.png",
    narration: "정리할게요. 오늘 우리가 뺀 거, 세 개입니다. 계정 날릴 뻔한 위험한 연결 방식, 광고 관리자에서 헤매던 시간, 그리고 월요일 아침 보고서 노가다. 자동화라는 게 거창한 게 아니라, 이렇게 하나씩 빼는 거더라고요." },
  { idx: 18, broll: "gfx-closing2.png",
    narration: "오늘 영상 도움 되셨으면 구독이랑 좋아요 눌러주세요. 쓸데없는 건 제가 계속 빼드릴게요. 다음엔 이 메타 MCP에 노션이랑 슬랙까지 묶어서, 아침 보고 완전 자동화하는 법 가져오겠습니다. 다음 영상에서 만나요." },
] }

async function main() {
  log("=== 파이프라인 시작:", projectId, "| 세그먼트", SCRIPT.segments.length, "(메타 MCP) ===")
  const vSegs = SCRIPT.segments.map((s) => ({ idx: s.idx, narration: s.narration }))
  const vJob = startVoiceGen(projectId, vSegs, "Yuna")
  let vs
  do { await sleep(3000); vs = voiceStatus(vJob); log("음성", (vs.progress || 0) + "%", "engine=" + vs.engine, (vs.done || 0) + "/" + vs.total) } while (vs.status === "running")
  const ok = vs.segs.filter((x) => x.ok).length
  log("음성 완료:", vs.status, "성공 " + ok + "/" + vs.total, "| voice=" + vs.voice)
  if (!ok) { log("!! 음성 전부 실패 → 중단:", vs.error || (vs.segs[0] && vs.segs[0].error)); process.exit(1) }
  const asm = buildManifest(projectId, SCRIPT, vs.segs, { voiceName: vs.voice, now: new Date().toISOString() })
  log("조립 완료:", asm.segments, "세그먼트,", asm.total_duration_sec + "s")
  const rJob = startRender(projectId)
  log("렌더 시작:", rJob)
  let rs
  do { await sleep(6000); rs = renderStatus(rJob); log("렌더", (rs.progress || 0) + "%", rs.phase || "") } while (rs.status === "running")
  log("=== 렌더 완료:", rs.status, "|", rs.out ? (Math.round(rs.out.bytes / 1e6) + "MB " + rs.out.path) : (rs.error || ""), "===")
  process.exit(rs.status === "done" ? 0 : 1)
}
main().catch((e) => { log("!! 예외:", e && e.message); process.exit(1) })
