---
name: yt-thumbnail
description: 유튜브 롱폼 썸네일 후보를 생성하는 운영 스킬. yt-structure의 ① 제목/썸네일 구조(thumbnail_copy 슬롯·image_notes)와 yt-script가 확정한 썸네일 문구, 그리고 채널 프로파일(yt-channel)의 타겟 선호를 입력받아, 비즈니스PT "이미지 디벨롭 6원칙"으로 시각 컨셉을 잡고 Higgs generate_image로 썸네일 후보 이미지를 만든 뒤 문구 오버레이 가이드와 선택 가이드를 산출한다. 절대 기준은 CTR 10%. 사용자가 "썸네일 만들어줘/뽑아줘", "썸네일 후보 생성", "이 영상 썸네일 디벨롭"이라고 할 때 활성화.
metadata:
  origin: 빼기연구소 (나는빼기연구소)
  pipeline: subtract-tube
---

# yt-thumbnail — 이미지 디벨롭 6원칙 → Higgs 썸네일 후보 생성기 (운영 ①)

> 호출자: 빼기연구소 크리에이터(또는 subtract-tube 파이프라인의 운영 단계). 상위 단계(구조·원고)가 끝난 영상의 **썸네일을 실제로 뽑는** 스킬이다.
> 상위 입력: `yt-structure`의 `① title_thumbnail`(썸네일 카피 슬롯 + image_notes 6원칙 메모), `yt-script`가 원고 끝에 함께 낸 **썸네일/제목 문구**, `yt-channel`의 `CHANNEL PROFILE`(audience.demographic_guess·persona·direction = 타겟 선호 이미지 판단 근거).
> 다운스트림 소비자: 크리에이터가 직접 업로드(또는 `yt-seo`가 메타데이터와 함께 묶음). 선택된 썸네일 1장 + 문구 오버레이가 최종 산출.
> 내부 소스 오브 트루스: `knowledge/biz-pt-longform-blueprint.md`(§0 KPI = CTR 10%, §③ 썸네일 디벨롭 6원칙·제작수단). 이 스킬은 그 방법론을 자체 포함(self-contained)한다.
> 외부 연동: **Higgs `generate_image`(MCP, 연결됨)**. 별도 API 키 불필요 — Higgs 계정 크레딧으로 동작한다. 미드저니/DALL-E/나노바나나/시드림4 등 blueprint의 다른 제작수단은 Higgs로 대체·보강한다.

---

## 핵심 전제 — 이 스킬의 자리

```
[원고/구조 확정] yt-structure(① 썸네일 슬롯) + yt-script(확정 문구)
        │  + yt-channel(타겟 선호)
        ▼
   yt-thumbnail ──(6원칙)──▶ 시각 컨셉 N개 ──▶ Higgs generate_image ──▶ 후보 이미지 + 오버레이 가이드 + 선택 가이드
                                                                          └▶ CTR 10% 게이트로 통과/탈락
```

- **썸네일은 제목과 한 쌍으로 CTR을 만든다.** 이 스킬은 *이미지*를 책임지고, *문구*는 yt-structure/yt-script가 이미 확정한 것을 받아 **오버레이**한다(여기서 새로 창작하지 않는다).
- **절대 기준은 CTR 10%.** blueprint §0. 모든 후보는 "이 이미지가 제목과 결을 맞춰 클릭률 10%를 만들 수 있는가?"로 평가된다.
- **이미지는 만들되 텍스트 오버레이는 분리한다.** AI 이미지 생성기는 한글 텍스트를 깨먹는다. 따라서 Higgs로는 **문구 없는(또는 문구 자리를 비운) 배경 이미지**를 만들고, 문구는 미리캔버스/포토샵에서 오버레이하도록 **가이드만** 낸다. (Higgs 프롬프트에 한글 카피를 박지 않는다.)

---

## When to Activate

다음 중 하나면 이 스킬을 켠다.

- 사용자가 **"썸네일 만들어줘/뽑아줘"**, "썸네일 후보 생성해줘", "이 영상 썸네일 디벨롭해줘"라고 할 때.
- subtract-tube 파이프라인에서 원고(yt-script)가 끝나고 **업로드(yt-seo) 직전** 운영 단계에 진입할 때.
- 발행 후 `yt-analyze`가 "24시간 탐색유입이 약하다 → 썸네일 교체"를 권고했을 때(재생성 루프).

제목/썸네일 *문구*를 새로 짜는 것은 이 스킬이 아니라 yt-structure/yt-script의 몫이다. 이 스킬은 **확정된 문구를 입은 이미지**를 만든다.

---

## 입력 (Inputs)

| 입력 | 출처 | 설명 | 없을 때 |
|---|---|---|---|
| **썸네일 문구(카피)** | yt-script / yt-structure `① thumbnail_copy.verbatim` | 썸네일에 박힐 확정 한글 카피 | **필수.** 없으면 yt-script 산출 또는 1줄을 직접 받는다 |
| **image_notes (6원칙 메모)** | yt-structure `① title_thumbnail.image_notes` | 6원칙 중 적용된 것(확대/증명/인물/궁금/선호/비포애프터) | 없으면 아래 6원칙을 문구·주제로 역추론 |
| **제목** | yt-script 제목 후보 | 썸네일과 결 일치 확인용(이미지엔 안 들어감) | 없으면 1회 질문 |
| **핵심 문제 1문장** | yt-script | 결(結) 일치 기준점 | 없으면 문구·주제로 추정 |
| **타겟 선호** | yt-channel `audience.demographic_guess`·`persona`·`direction` | 시청자층이 끌리는 이미지 톤(원칙 5) | 없으면 일반 톤 + 신뢰도 메모 |
| (선택) 비포/애프터·실증 소스 | 사용자 | 원칙 2·6용 실제 캡처/사진 | 없으면 AI 생성으로 대체 |
| (선택) 후보 수 | 사용자 | 기본 **3장** | 미지정 시 3 |

> 모든 입력은 상위 스킬 산출을 우선 신뢰한다. 빠진 칸은 추정하되 `confidence: inferred`로 표기한다.

---

## 방법론 — 이미지 디벨롭 6원칙 (blueprint §③)

문구를 시각적으로 강화해 CTR을 올린다. 후보마다 **6원칙 중 2개 이상**을 의도적으로 적용한다(전부 다 넣을 필요는 없다 — 결을 흐림).

| # | 원칙 | 썸네일에서 하는 일 | Higgs 프롬프트에 반영하는 법 |
|---|---|---|---|
| 1 | **확대된 이미지** | 핵심 피사체를 꽉 차게 크롭 | "extreme close-up", "tight crop", 여백 최소 |
| 2 | **시각적 증명자료** | 후킹을 뒷받침할 증거(그래프/결과 화면/물건) | "before/after split", "visible result", "evidence on screen" |
| 3 | **신뢰도 높은 인물/전문가** | 개인가치 높을 때 권위 인물 | "confident expert", "professional setting" (실인물은 직접촬영 권장) |
| 4 | **이득 강화 / 피해 방지 → 궁금증** | 보상 또는 손실을 직관적으로, 궁금하게 | "intriguing", "curiosity gap", 가림/은폐 연출 |
| 5 | **시청자층 선호 이미지** | 타겟(yt-channel demographic)이 끌리는 톤·소재 | demographic 기반 색감·소재·연령대 반영 |
| 6 | **비포-애프터** | 보상을 좌우/상하 대비로 직관화 | "split comparison, left vs right", 변화 폭 강조 |

**선택 규칙:** 후보 A/B/C는 서로 다른 원칙 조합으로 분기시킨다(예: A=확대+궁금증, B=비포애프터+증명, C=인물+선호). 그래야 발행 후 `yt-analyze`의 24시간 탐색유입 비교로 **어느 시각 전략이 먹혔는지**를 변수 분리해 배울 수 있다.

### 문구 오버레이 가이드(이미지엔 안 박고, 가이드로 낸다)

- **오버레이 위치:** 좁은 어깨↔넓은 어깨 등 피사체와 안 겹치는 영역(주로 좌상단/하단).
- **대비:** 배경 위 텍스트 가독성을 위해 외곽선/그림자/박스. 모바일 썸네일(작게 보임) 기준 글자 크게.
- **강조어:** 문구 중 숫자·충격어 1~2개만 색 대비로 키운다(전부 키우면 위계가 죽는다).
- **글자 수:** 모바일에서 읽히게 **한 줄에 6~9자**, 최대 2줄.
- **Higgs 프롬프트에는 한글 텍스트를 넣지 않는다** — 오버레이는 미리캔버스/포토샵에서. (AI가 한글을 깨먹기 때문.)

---

## 외부 연동 — Higgs generate_image (정직한 연동 명세)

- **도구:** MCP `mcp__claude_ai_Higgs__generate_image` (이 환경에 **연결됨**).
- **인증:** 별도 API 키 불필요. Higgs 워크스페이스/크레딧으로 동작(크레딧 소진 시 `balance`/`show_plans_and_credits`로 안내).
- **모델 선택:** 어떤 이미지 모델이 맞는지 모호하면 먼저 `mcp__claude_ai_Higgs__models_explore(action:'recommend')`로 추천받은 뒤 `generate_image`를 호출한다(서버 지침 준수).
- **호출 형태(개념):** 후보 수만큼 `generate_image`를 호출하되, **종횡비 16:9**(유튜브 썸네일 1280×720), 프롬프트는 위 6원칙 조합 + 타겟 선호를 영어로 기술하고 **한글 카피는 제외**. 인물 실사가 필요하면 직접촬영을 우선 권한다(원칙 3).
- **로컬 이미지 입력이 필요할 때:** 사용자가 비포/애프터 등 로컬 사진을 가졌다면 `media_upload_widget`(Apps UI) 또는 `media_import_url`(웹 URL)로 먼저 올리고 반환된 media_id를 사용한다. 원시 URL을 params에 직접 넣지 않는다.
- **후처리(필요 시):** 해상도 부족 → `upscale_image`, 배경 제거 → `remove_background`, 캔버스 확장 → `outpaint_image`.
- **연동 불가 시 폴백:** Higgs가 막히면 **시각 컨셉(프롬프트)·6원칙 매핑·오버레이 가이드만** 텍스트로 내고, "미리캔버스/포토샵/미드저니로 이 프롬프트를 직접 생성하세요"로 안내한다(blueprint §③ 제작수단). 즉 **이미지가 없어도 컨셉 산출물은 항상 낸다.**

---

## 출력 계약 (Output Contract)

아래 `THUMBNAIL CANDIDATES` 블록을 산출한다. 후보 N개 + 선택 가이드 + 오버레이 가이드를 포함한다.

```
## THUMBNAIL CANDIDATES
context:
  copy_verbatim: "<썸네일 확정 문구>"
  title: "<짝이 되는 제목>"
  core_problem: "<핵심 문제 1문장 — 결 기준점>"
  target: "<yt-channel demographic/persona 요약>"
  generator: "Higgs generate_image" | "concept-only(연동불가 폴백)"

candidates:
  - id: A
    principles: ["1 확대","4 궁금증"]          # 적용한 6원칙(2개+)
    image_prompt: "<Higgs용 영어 프롬프트 — 한글 카피 제외, 16:9>"
    asset: "<생성된 이미지 ref/URL 또는 '미생성(폴백)'>"
    overlay:
      text: "<오버레이할 한글 문구>"
      placement: "<위치 — 피사체와 안 겹치게>"
      emphasis: "<크게 키울 숫자/충격어 1~2개>"
    ctr_rationale: "<왜 이 컨셉이 CTR 10%에 기여하는가 한 줄>"
  - id: B ...
  - id: C ...

selection_guide:
  recommend: "<A|B|C 추천 + 이유 한 줄>"
  ab_test: "<24h 탐색유입으로 비교할 변수(A=확대 vs B=비포애프터 등) — yt-analyze로 넘김>"
  consistency: "<제목·문구·이미지가 같은 결인지 한 줄 평>"

quality_gate:
  ctr_target: "10% 의식"
  notes: "<confidence: confirmed/inferred, Higgs 크레딧/폴백 여부>"
```

---

## 품질 게이트 (Quality Gates)

산출 전 점검한다. 하나라도 실패하면 고쳐 다시 통과시킨다.

- [ ] 모든 후보가 **6원칙 중 2개 이상**을 의도적으로 적용했는가?
- [ ] 후보 A/B/C가 **서로 다른 원칙 조합**으로 분기돼, 발행 후 변수 분리 학습이 가능한가?
- [ ] Higgs 프롬프트에 **한글 카피를 넣지 않았는가?**(텍스트는 오버레이 가이드로 분리)
- [ ] **종횡비 16:9 / 모바일 가독성**(글자 크게, 한 줄 6~9자)을 명시했는가?
- [ ] 이미지·문구·제목이 **결(結) 일치**하는가?(핵심 문제 1문장을 같이 향하는가)
- [ ] **CTR 10%**를 의식한 `ctr_rationale`이 후보마다 있는가?
- [ ] 타겟 선호(원칙 5)가 yt-channel demographic에 근거했는가?(없으면 inferred 표기)
- [ ] Higgs 연동 실패 시 **컨셉/프롬프트/오버레이 가이드만이라도** 냈는가?(이미지 없어도 산출물 보장)

---

## Worked Example (간결)

**입력:** 문구 "이것 하나로 어깨가 벌어졌습니다" / 제목 "헬스장만 다니던 평범한 사람이 어깨 벌어진 3가지 방법" / 핵심문제 "헬스장 다녀도 어깨가 안 벌어진다" / 타겟 "남성 30~40대, 운동 입문".

```
## THUMBNAIL CANDIDATES
context:
  copy_verbatim: "이것 하나로 어깨가 벌어졌습니다"
  title: "헬스장만 다니던 평범한 사람이 어깨 벌어진 3가지 방법"
  core_problem: "헬스장 다녀도 어깨가 안 벌어진다"
  target: "남성 30~40대 운동 입문, 비포애프터에 반응"
  generator: "Higgs generate_image"

candidates:
  - id: A
    principles: ["6 비포애프터","1 확대"]
    image_prompt: "16:9, split comparison left vs right, narrow shoulders vs broad shoulders, tight crop on upper body, gym lighting, photorealistic, no text"
    asset: "<higgs img ref A>"
    overlay: { text: "이것 하나로", placement: "좌상단(피사체 위 여백)", emphasis: "이것" }
    ctr_rationale: "비포애프터로 보상을 즉시 직관화 → 운동 입문 타겟의 클릭 욕구"
  - id: B
    principles: ["4 궁금증","1 확대"]
    image_prompt: "16:9, extreme close-up of a single gym item half-hidden, dramatic lighting, curiosity gap, photorealistic, no text"
    asset: "<higgs img ref B>"
    overlay: { text: "이것 하나로 어깨가", placement: "하단 박스", emphasis: "이것" }
    ctr_rationale: "'이것'을 시각적으로 은폐 → 궁금증 갭으로 클릭"
  - id: C
    principles: ["3 인물","5 선호"]
    image_prompt: "16:9, confident male trainer 30s, broad shoulders, gym, professional, photorealistic, no text"
    asset: "미생성(실인물 직접촬영 권장)"
    overlay: { text: "어깨가 벌어졌습니다", placement: "우측", emphasis: "벌어졌" }
    ctr_rationale: "권위 인물 + 타겟 연령 일치 → 신뢰 기반 클릭"

selection_guide:
  recommend: "A — 비포애프터가 운동 입문 타겟에 가장 직관적"
  ab_test: "A(비포애프터) vs B(궁금증 은폐)를 24h 탐색유입으로 비교 → yt-analyze"
  consistency: "제목 '평범→벌어짐' = 썸네일 비포애프터 = 문구 '이것 하나로' 한 결 ✔"

quality_gate: { ctr_target: "10% 의식", notes: "C는 실인물 권장으로 미생성. A/B confirmed." }
```

---

> 이 스킬은 "썸네일 *이미지*를 실제로 뽑는" 운영 스킬이다. 문구를 새로 창작하지 말고(상위 스킬 산출 사용), 6원칙을 의도적으로 적용해 CTR 10% 후보를 분기시켜라. Higgs 연동은 정직하게 — 되면 이미지까지, 막히면 컨셉/프롬프트/오버레이 가이드까지는 반드시 낸다. 한글 텍스트는 AI 이미지에 박지 말고 오버레이로 분리한다.
