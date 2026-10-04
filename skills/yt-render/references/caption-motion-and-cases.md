# yt-render 확장 — 자막 가독성 · 연출 모션 · 실제 사례 주입

> 2026-07-31 meta-ads-mcp 편에서 확립. yt-render가 렌더 직전/중에 반드시 적용하는 3개 로직.
> 관련 서비스: `subtract-tube/radar/src/*`, `subtract-tube/remotion/src/*`.

---

## 1. 자막 가독성 (필수 후처리)

**문제**: ElevenLabs 문자 타임스탬프를 16자에서 기계 절단하면 의미단위가 쪼개지고("요즘 영상"┃"많죠") 0.5초짜리 고아 조각이 생김.

**해결**: `radar/src/cues.mjs`의 `regroupCues(cues, opts)`.
- `opts = { cueMax: 34, oneLineMax: 18, minTail: 6 }` (검증된 기본값)
- 동작: ① 문장 종결부호(`.?!…`)까지 병합 → ② cueMax 초과 시 쉼표/어절 경계에서 분할 → ③ minTail 미만 꼬리는 앞 큐에 흡수 → ④ `balanceTwoLines`로 어절 2줄 균형(쉼표 직후 우선 + 1음절 꼬리 회피).
- **타이밍은 병합만** 하므로(start=첫조각, end=마지막조각) 음성 싱크 유지.

**배선(이미 영구 적용됨)**:
- `assemble.mjs`: `subtitles: regroupCues(v.cues || [])` — 모든 신규 영상 자동 적용.
- `remotion/src/index.tsx` 자막 div: `whiteSpace: "pre-line"`(우리가 넣은 `\n` 줄바꿈 표시) + `wordBreak: "keep-all"`(한글 어절 안 깨짐).

**렌더 전 체크**: 큐당 최대 한 줄 폭 ≤ 20(48px·82%폭 기준), 고아(≤6자) 0개.

---

## 2. 연출 모션 (데이터 주도, `remotion/src/motion.tsx`)

기존 6종 `scoreboard/bars/tally/checklist/mockcompare/mocksingle` + 2026-07 추가 3종:

| type | data shape | 언제 |
|---|---|---|
| `statCount` | `{ from?, to, prefix?, suffix?, caption?, title? }` | 수치가 훅일 때(카운트업/모핑). 예: `{to:3, suffix:"가지", caption:"오늘 뺀 것"}` |
| `sectionSpine` | `{ title?, items:[string], active }` | "N가지 중 지금 여기"·리캡. active=완료수(그 이하 ✓딤, 같으면 파랑 글로우) |
| `analogyCard` | `{ concept, conceptIcon, analogy, analogyIcon, note?, title? }` | 추상 개념=물리 비유. 이모지 아이콘. 예: 🔑액세스토큰 = 🏠남의집에맡기기 |

**주의**:
- 이모지는 Chromium 렌더에서 풀컬러로 정상 출력됨(검증됨).
- `analogyCard.note`는 라벨 아래(top:632, DIM)에 둘 것 — 하단(bottom)에 두면 **싱크 자막과 충돌**(2026-07-31 수정 이력).
- `motion`을 세그먼트에 넣으면 그 세그의 broll 이미지를 대체함(`index.tsx`: `seg.motion ? MotionScene : broll`). 기존 커스텀 그래픽이 있는 세그는 덮어쓰지 말 것.

---

## 3. 레퍼런스 영상 연출 분석 루프 (연출 품질 상향)

좋은 벤치마크 영상을 발견하면 연출을 시스템에 흡수한다.
1. Higgs `video_analysis_create({youtube_url})` → `video_analysis_status` 폴링(3~5분, 씬 단위).
2. 분석을 `radar/data/higgs-notes/<videoId>.json`으로 저장 — 계약: `{videoId, source, analyzedAt(ISO), summary, visualStyle, editingPattern, hookVisual, thumbnailStrategy, captionStyle, signatureTechniques[], scenes:[{t,visual,note}]}` (`higgs-notes.mjs` 상단 참조).
3. `analyzeReferences`가 이 노트를 원고/연출 저작 프롬프트에 주입 → 모션 타입 선택·팔레트·훅 설계에 반영.
- 예시 노트: `2oOXHWGn_Cw.json`(메이커 에반 — 단일강조색 규율/개념=아이콘/비유앵커링/수치모핑/구조스파인).

---

## 4. 실제 사례 주입 (NEW — 데모 레퍼런스 → 준비된 실제 사례 교체)

일부 영상은 "실제로 돌려본 사례"를 보여줘야 신뢰가 산다(예: 실전 활용 N가지). 현재는 자리표시로 **데모/재현 이미지**(gfx 목업, "재현 이미지" 배지)를 넣지만, **사례가 미리 준비돼 있으면 그 사례를 전달·삽입**하는 단계를 렌더 전에 둔다.

**프로세스**:
1. **사례 유무 확인 게이트**: 원고의 각 "실전/활용" 세그먼트에 대해 — "이 장면에 넣을 실제 사례(스크린샷·수치·결과물)가 준비돼 있는가?"를 사용자에게 묻는다. 준비돼 있으면 데모를 실제 사례로 교체, 없으면 데모 유지 + "재현 이미지" 배지 유지(정직성).
2. **사례 자산 계약**: 준비된 사례는 `subtract-tube/cases/<projectId>/`에 둔다.
   - `case-manifest.json`: `{ projectId, cases: [{ segIndex, kind:"screenshot|stat|result", asset?:"파일명", stat?:{label,value}, caption, real:true }] }`
   - 이미지 자산은 같은 폴더(png/jpg). `real:true`면 배지 없이, 데모면 `real:false`로 "재현 이미지" 배지 유지.
3. **주입**: 렌더 조립 시 `case-manifest`가 있으면 해당 `segIndex`의 `broll`/`motion`을 실제 사례로 치환:
   - screenshot → `mocksingle`/`mockcompare`의 `img`를 실제 캡처로, 배지 제거(`real:true`).
   - stat(수치 결과) → `statCount`(`to`=실측값, caption=사례 설명).
4. **정직성 규칙(불변)**: 실제 사례가 아니면 절대 실제인 것처럼 표기하지 않는다. 재현/데모는 항상 "재현 이미지" 배지 유지. 실측 수치만 statCount에 실값으로.

**사용자 흐름**: "이 영상 사례 준비됐어" → `cases/<projectId>/`에 자산 + case-manifest 배치 → yt-render가 데모를 실제 사례로 자동 교체 후 렌더.
