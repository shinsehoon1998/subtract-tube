/**
 * 자막 큐 재조합 — 말·타이밍은 그대로 두고, 화면 자막의 "가독성"만 끌어올린다.
 *
 * 입력: ElevenLabs 문자 타임스탬프에서 잘린 잔조각 큐 배열 [{text,start,end}, ...]
 * 문제: ~16자 기계 절단 → 의미단위가 쪼개지고("요즘 영상"┃"많죠") 0.5초짜리 고아("많죠.")가 생김.
 * 해결: (1) 문장 종결부호까지 병합 → 문장 단위 큐, (2) 너무 길면 쉼표/어절 경계에서 분할,
 *      (3) 한 줄에 안 들어가면 어절 경계에서 2줄 균형 줄맞춤(\n), (4) 짧은 꼬리는 앞 큐에 흡수.
 * 타이밍은 병합만 하므로(시작=첫조각.start, 끝=마지막조각.end) 음성 싱크가 깨지지 않는다.
 */

const SENTENCE_END = /[.!?…]["')\]]?$/
const COMMA_END = /[,，]$/

/** 표시폭 근사: 한글/전각 1.0, 그 외(라틴·숫자·공백) 0.55. 48px·82%폭 화면 기준. */
export function dispWidth(str) {
  let w = 0
  for (const ch of String(str)) {
    w += /[ᄀ-ᇿ㄰-㆏가-힣　-〿＀-￯]/.test(ch) ? 1 : 0.55
  }
  return w
}

/** 한 줄 텍스트를 어절 경계에서 2줄로 균형 분할. 단어 1개거나 짧으면 그대로.
 *  점수 = 좌우 폭 불균형 − 쉼표우대 + 1음절꼬리벌점. 낮을수록 좋은 분할점.
 *  · 쉼표 직후 줄바꿈을 강하게 선호(자연 호흡).
 *  · 1음절 수식어("한","까","그")가 윗줄 끝에 고립되지 않게 벌점(→ "한 방을"이 붙어 다님). */
export function balanceTwoLines(text, oneLineMax) {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length < 2 || dispWidth(text) <= oneLineMax) return text
  const total = dispWidth(text)
  let acc = 0, best = 1, bestScore = Infinity
  for (let i = 0; i < words.length - 1; i++) {
    acc += dispWidth(words[i]) + 0.5
    const balance = Math.abs(acc - (total - acc))
    const commaBonus = COMMA_END.test(words[i]) ? 4 : 0
    const stubPenalty = words[i].replace(/[.,!?…]/g, "").length <= 1 ? 3 : 0
    const score = balance - commaBonus + stubPenalty
    if (score < bestScore) { bestScore = score; best = i + 1 }
  }
  return words.slice(0, best).join(" ") + "\n" + words.slice(best).join(" ")
}

/**
 * @param {{text:string,start:number,end:number}[]} cues
 * @param {{cueMax?:number, oneLineMax?:number, minTail?:number}} [opts]
 *   cueMax: 큐 하나 최대 표시폭(넘으면 분할). oneLineMax: 이 이하면 1줄. minTail: 이 폭 미만 꼬리는 흡수.
 */
export function regroupCues(cues, opts = {}) {
  const cueMax = opts.cueMax ?? 30
  const oneLineMax = opts.oneLineMax ?? 17
  const minTail = opts.minTail ?? 6
  if (!Array.isArray(cues) || cues.length === 0) return []

  // 1) 문장 단위로 조각 묶기 (종결부호로 끊음)
  const sentences = []
  let cur = []
  for (const c of cues) {
    if (!c || !c.text) continue
    cur.push(c)
    if (SENTENCE_END.test(c.text.trim())) { sentences.push(cur); cur = [] }
  }
  if (cur.length) sentences.push(cur)

  // 2) 각 문장을 cueMax 이하 큐들로 (조각 경계에서만 분할, 쉼표 직후 우대)
  const out = []
  for (const frags of sentences) {
    let bucket = []
    const flush = () => {
      if (!bucket.length) return
      const text = bucket.map((f) => f.text.trim()).join(" ").replace(/\s+/g, " ")
      out.push({ text, start: bucket[0].start, end: bucket[bucket.length - 1].end })
      bucket = []
    }
    for (const f of frags) {
      const projected = [...bucket, f].map((x) => x.text.trim()).join(" ")
      if (bucket.length && dispWidth(projected) > cueMax) flush()
      bucket.push(f)
      // 쉼표에서 자연스럽게 끊되, 이미 큐가 어느 정도 찼을 때만
      if (COMMA_END.test(f.text.trim()) && dispWidth(bucket.map((x) => x.text.trim()).join(" ")) >= cueMax * 0.66) flush()
    }
    flush()
  }

  // 3) 너무 짧은 꼬리 큐는 앞 큐에 흡수 (앞 큐가 종결부호로 끝났으면 문장 경계이므로 흡수 안 함)
  for (let i = out.length - 1; i > 0; i--) {
    const t = out[i].text
    const prevEndsSentence = SENTENCE_END.test(out[i - 1].text.trim())
    if (dispWidth(t) < minTail && !prevEndsSentence) {
      out[i - 1] = {
        text: (out[i - 1].text + " " + t).replace(/\s+/g, " "),
        start: out[i - 1].start,
        end: out[i].end,
      }
      out.splice(i, 1)
    }
  }

  // 4) 각 큐 2줄 균형 줄맞춤
  return out.map((c) => ({ ...c, text: balanceTwoLines(c.text, oneLineMax) }))
}
