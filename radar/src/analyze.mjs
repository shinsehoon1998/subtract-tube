import { loadEnv } from "./lib/env.mjs"
import { channelProfile } from "./fit-prompt.mjs"
import { fetchTranscript } from "./transcript.mjs"
import { loadHiggsNote, formatHiggsNote } from "./higgs-notes.mjs"

const MODEL = process.env.ANALYZE_MODEL || "claude-sonnet-4-6"

/** Anthropic tool-forcing → 항상 유효한 JSON 객체 반환. content=문자열 또는 [{image},{text}] 배열. */
async function callToolContent(content, toolName, schema, maxTokens) {
  const key = loadEnv().ANTHROPIC_API_KEY
  if (!key) throw new Error("ANTHROPIC_API_KEY 없음")
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: MODEL, max_tokens: maxTokens,
      tools: [{ name: toolName, description: "구조화 결과 반환", input_schema: schema }],
      tool_choice: { type: "tool", name: toolName },
      messages: [{ role: "user", content }],
    }),
  })
  if (!r.ok) throw new Error("anthropic " + r.status + ": " + (await r.text().catch(() => "")).slice(0, 300))
  const d = await r.json()
  const tu = (d.content || []).find((b) => b.type === "tool_use")
  if (!tu) throw new Error("tool_use 없음")
  return tu.input
}
const callTool = (prompt, toolName, schema, maxTokens) => callToolContent(prompt, toolName, schema, maxTokens)

const TITLE_THUMB_SCHEMA = {
  type: "object",
  properties: {
    titlePattern: { type: "string", description: "제목 후킹 패턴(구조·후킹어·길이·숫자/대괄호·궁금증 갭)" },
    titleFormulas: { type: "array", items: { type: "string" }, description: "우리 주제에 바로 쓸 제목 공식 2~3개(빈칸 포함)" },
    thumbnailComposition: { type: "string", description: "실제 썸네일 이미지의 구성 — 레이아웃·인물/요소 위치·색 대비·텍스트 배치·시선 유도" },
    thumbnailHookWords: { type: "array", items: { type: "string" }, description: "썸네일에 박힌/박을 강한 후킹 단어" },
  },
  required: ["titlePattern", "thumbnailComposition"],
}

/** 제목+썸네일 벤치마크 전용 분석: title_thumb ref의 실제 제목 + 썸네일 이미지(비전)를 분석. */
async function analyzeTitleThumb(ref) {
  if (!ref) return null
  const instr = [
    `벤치마크 '제목+썸네일' 레퍼런스다. 채널 "${ref.channel || "?"}", 제목 "${ref.title || ref.koTitle || ""}".`,
    "이 제목의 후킹 패턴과 (첨부된) 썸네일 이미지의 실제 시각 구성을 분석해, 우리가 모방할 수 있는 공식으로 정리하라.",
    "썸네일은 텍스트 추측 말고 붙은 이미지를 실제로 보고 분석하라(레이아웃·색 대비·인물/요소 위치·텍스트 배치).",
  ].join("\n")
  // 썸네일 이미지 비전(있으면). 실패 시 텍스트만.
  if (ref.thumbnail && /^https?:\/\//.test(ref.thumbnail)) {
    try {
      const ir = await fetch(ref.thumbnail)
      if (ir.ok) {
        const b64 = Buffer.from(await ir.arrayBuffer()).toString("base64")
        const mt = ir.headers.get("content-type") || "image/jpeg"
        return await callToolContent([
          { type: "image", source: { type: "base64", media_type: mt.includes("png") ? "image/png" : "image/jpeg", data: b64 } },
          { type: "text", text: instr },
        ], "submit_title_thumb", TITLE_THUMB_SCHEMA, 1500)
      }
    } catch {}
  }
  return await callToolContent(instr + "\n(썸네일 이미지 없음 — 제목 패턴 위주로.)", "submit_title_thumb", TITLE_THUMB_SCHEMA, 1500)
}

const ANALYZE_SCHEMA = {
  type: "object",
  properties: {
    perRef: { type: "array", items: { type: "object", properties: {
      role: { type: "string" }, title: { type: "string" }, originalSummary: { type: "string" }, borrow: { type: "string" },
    }, required: ["role", "originalSummary"] } },
    coreStructure: { type: "object", properties: {
      hookPattern: { type: "string" },
      sections: { type: "array", items: { type: "object", properties: {
        title: { type: "string" }, purpose: { type: "string" }, beats: { type: "string" },
      }, required: ["title", "purpose"] } },
      flow: { type: "string" }, pacing: { type: "string" },
      takeaways: { type: "array", items: { type: "string" } },
      direction: { type: "object", description: "영상 연출 구조(Higgs 노트 있을 때 근거 기반, 없으면 자막+메타 기반 추론)", properties: {
        visualStyle: { type: "string", description: "전반 비주얼 톤·화면 구성" },
        editingPattern: { type: "string", description: "컷 길이·전환·리듬 편집 패턴" },
        hookVisual: { type: "string", description: "도입 0~15초 시각적 후킹 방식" },
        captionStyle: { type: "string", description: "자막/키워드 연출(위치·강조·모션)" },
        thumbnailStrategy: { type: "string", description: "썸네일+제목 후킹 전략" },
        bRollGuide: { type: "string", description: "본문 b-roll·인서트 활용 가이드" },
      } },
    }, required: ["hookPattern", "sections", "flow"] },
  },
  required: ["perRef", "coreStructure"],
}

const SCRIPT_SCHEMA = {
  type: "object",
  properties: {
    titleCandidates: { type: "array", items: { type: "string" } },
    description: { type: "string" }, pinnedComment: { type: "string" },
    thumbnailConcepts: { type: "array", description: "썸네일 시안 2~3개(문구+비주얼 컨셉)", items: { type: "object", properties: {
      text: { type: "string" }, visual: { type: "string" },
    }, required: ["text"] } },
    editingNotes: { type: "string", description: "전체 편집·페이싱 연출 지시(컷 리듬·전환·자막 모션 톤)" },
    segments: { type: "array", items: { type: "object", properties: {
      idx: { type: "integer" }, narration: { type: "string" }, subtitle: { type: "string" },
      broll: { type: "string" }, emphasis: { type: "string" },
      visualDirection: { type: "string", description: "이 세그먼트의 화면 연출(장면·인서트·자막 배치·강조 모션)" },
      captionKeywords: { type: "array", description: "화면에 띄울 임팩트 자막 키워드 2~3개. 각 12자 이내의 짧은 구(예: '며칠→하루', '결론부터', '3단계'). subtitle/emphasis(감독노트)와 달리 실제 화면 표시용.", items: { type: "string" } },
    }, required: ["idx", "narration"] } },
  },
  required: ["titleCandidates", "segments"],
}

/** 래퍼런스 자막(yt-dlp) + ref별 Higgs 영상분석 노트 → 원고+연출 핵심 구조 추출 */
export async function analyzeReferences(refs, videoNotes = "") {
  const ids = [...new Set(refs.map((r) => r.videoId).filter(Boolean))]
  const pairs = await Promise.all(ids.map(async (id) => [id, await fetchTranscript(id)]))
  const txMap = new Map(pairs)
  const withTx = refs.map((r) => {
    const tx = r.videoId ? txMap.get(r.videoId) : null
    const note = r.videoId ? loadHiggsNote(r.videoId) : null
    return { ...r, hasTx: !!tx, hasHiggs: !!note, transcript: tx ? tx.slice(0, 2800) : null, higgs: formatHiggsNote(note) }
  })
  const block = withTx.map((r, i) =>
    `[${i + 1}] role=${r.role} · 채널 ${r.channel || "?"} · 제목 "${r.title || ""}"\n` +
    `자막(실제 추출): ${r.transcript || "(자막 없음)"}\n` +
    `연출 노트(Higgs 영상분석): ${r.higgs || "(연출 노트 없음)"}`
  ).join("\n\n")
  const anyHiggs = withTx.some((r) => r.hasHiggs)
  const prompt = [
    "아래는 벤치마크 래퍼런스 영상들이다 (topic=주제, title_thumb=제목+썸네일, hook=도입부, body=본문 구성).",
    "각 항목에는 (a) yt-dlp로 실제 추출한 자막 원문과 (b) Higgs가 장면별로 분석한 연출 노트(있을 때)가 붙어 있다.", "", block,
    videoNotes ? "\n[추가 전역 연출 노트]\n" + videoNotes : "",
    "",
    "작업: ① 각 래퍼런스 원본 내용을 2~3문장 요약(originalSummary)하고 차용 포인트(borrow)를 적어라.",
    "② 자막에 드러난 실제 전개를 근거로 '핵심 구조'를 추출하라(추측 금지, 자막 기반).",
    "핵심구조 = 도입부 후킹 패턴, 섹션 분해(목적·핵심 비트), 전체 흐름, 페이싱, takeaway.",
    "③ direction(연출) 구조도 추출하라 = 비주얼 스타일·편집 패턴·도입 비주얼 후킹·자막 연출·썸네일 전략·b-roll 가이드.",
    anyHiggs
      ? "   연출은 붙어 있는 Higgs 장면별 노트를 1차 근거로 삼아라(노트 없는 항목만 자막·제목으로 보완 추론)."
      : "   Higgs 노트가 없으므로 연출은 자막 흐름·제목·역할(role) 기반으로 신중히 추론하고, 추측인 부분은 그렇게 표기하라.",
  ].join("\n")
  const meta = withTx.map((r) => ({ role: r.role, hasTx: r.hasTx, hasHiggs: r.hasHiggs, txLen: r.transcript?.length || 0 }))
  // 제목+썸네일 벤치마크는 자막이 아니라 제목·썸네일 이미지를 별도 분석(C·B)
  const ttRef = refs.find((r) => r.role === "title_thumb")
  const [result, titleThumbBench] = await Promise.all([
    callTool(prompt, "submit_analysis", ANALYZE_SCHEMA, 6000),
    analyzeTitleThumb(ttRef).catch(() => null),
  ])
  return { ...result, titleThumbBench, _txMeta: meta }
}

/** 핵심 구조(원고+연출)를 채널 보이스로 치환해 한국어 원고·연출안 생성 */
export async function generateScript(coreStructure, topic, titleThumbBench = null) {
  const hasDirection = coreStructure && coreStructure.direction && Object.keys(coreStructure.direction).length > 0
  const ttBlock = titleThumbBench
    ? ["[선택한 제목+썸네일 벤치마크 — 이걸 모방하라]", JSON.stringify(titleThumbBench, null, 2),
       "→ titleCandidates는 위 titlePattern/titleFormulas를 우리 주제에 적용해 만들어라(공식 그대로, 어색하지 않게).",
       "→ thumbnailConcepts는 위 thumbnailComposition·thumbnailHookWords의 레이아웃·대비·후킹어를 계승하라.", "", "---", ""]
    : []
  const prompt = [
    "우리 채널 프로파일(보이스·페르소나·금칙):", "", channelProfile(), "", "---", "",
    ...ttBlock,
    "벤치마크에서 추출한 검증된 핵심 구조(자막+연출 기반):", "", JSON.stringify(coreStructure, null, 2), "", "---", "",
    `이 핵심 구조를 우리 채널 보이스로 1:1 치환해, 주제 "${topic}"의 한국어 페이스리스 롱폼 원고+연출안을 작성하라.`,
    "- 도입부는 hookPattern을 우리식(결론부터/공감 후킹)으로 재현.",
    "- 본문은 sections 흐름을 따르되 입문 시니어+직장인 부업 청중에게 떠먹여주듯, 10분 따라하기 톤.",
    "- 세그먼트 6~10개. 과장 수익 등 금칙 준수, 채널 말버릇 반영.",
    "- 세그먼트마다 captionKeywords 2~3개: 화면에 띄울 짧은 임팩트 자막(각 12자 이내, 예 '며칠→하루'·'결론부터'·'딱 3단계'). 나레이션 핵심을 압축하되 subtitle과 중복 금지, 감독노트(emphasis) 금지.",
    hasDirection
      ? "- 연출: coreStructure.direction을 우리 채널 제작 여건에 맞게 번역해, 세그먼트마다 visualDirection(화면 연출)을 채우고 상단에 thumbnailConcepts와 editingNotes를 제시하라."
      : "- 연출: direction 근거가 약하니 자막 흐름 기반으로 세그먼트별 visualDirection·썸네일 시안·편집 톤을 보수적으로 제안하라.",
  ].join("\n")
  return callTool(prompt, "submit_script", SCRIPT_SCHEMA, 12000)
}
