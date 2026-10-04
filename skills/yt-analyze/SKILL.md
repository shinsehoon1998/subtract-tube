---
name: yt-analyze
description: 발행한 유튜브 롱폼의 성과를 읽어 디벨롭 액션으로 바꾸는 운영 스킬. 24시간 탐색유입으로 썸네일을 평가하고, 발행 7일 검색유입+키워드로 제목을 디벨롭하며, 베스트 분석 후 고정댓글·재생목록·최종화면·쇼츠 관련영상 변경을 제안한다. 데이터는 YouTube Analytics API(OAuth 필요)로 읽고, 없으면 YouTube Studio 수동 입력으로 진행한다. 출력은 분석 리포트 + 다음 영상으로 넘기는 피드백 액션. 사용자가 "성과 분석해줘", "이 영상 어땠어", "썸네일/제목 바꿔야 해?", "디벨롭 액션 뽑아줘"라고 할 때 활성화.
metadata:
  origin: 빼기연구소 (나는빼기연구소)
  pipeline: subtract-tube
---

# yt-analyze — 성과분석 → 디벨롭 액션 환류기 (운영 ③ · 루프 닫기)

> 호출자: 빼기연구소 크리에이터(또는 subtract-tube 파이프라인 운영 단계). 영상 발행 후 **24시간·7일 시점**에 켜는 스킬. 파이프라인의 마지막이자 다음 사이클의 시작(디벨롭 루프를 닫는다).
> 상위 입력: 발행된 영상(`yt-seo`가 올린 것)의 성과 데이터 + 그 영상의 `yt-thumbnail`(어떤 썸네일/A·B 변수였나)·`yt-seo`(제목·키워드·태그)·`yt-script`(핵심 문제 1문장) 산출.
> 다운스트림 소비자: **다음 영상의 `yt-structure`/`yt-thumbnail`/`yt-seo`/`yt-script`.** 이 스킬의 디벨롭 액션은 같은 영상의 즉시 변경(고정댓글·재생목록·최종화면)과, 다음 영상으로 넘기는 피드백 두 갈래로 나간다.
> 내부 소스 오브 트루스: `knowledge/biz-pt-longform-blueprint.md`(§⑦ 성과분석 — 24h 탐색유입→썸네일, 7d 검색유입+키워드→제목, 베스트 후 변경 대상 / §2 디벨롭 루프 / §0 KPI). 이 스킬은 그 방법론을 자체 포함(self-contained)한다.
> 외부 연동: **YouTube Analytics API v2 + Data API v3 — OAuth 2.0(읽기 전용 스코프) 필요.** 트래픽 소스·유지율·노출 CTR은 채널 소유자 데이터라 OAuth 없이는 못 읽는다. 없으면 **YouTube Studio 수동 입력**으로 진행한다.

---

## 핵심 전제 — 이 스킬의 자리

```
[발행됨] yt-seo가 올린 영상
   │ 24h ──▶ 탐색유입(노출·탐색 CTR) ──▶ 썸네일 평가 ──▶ (약하면) yt-thumbnail 재생성 / 즉시 교체
   │ 7d  ──▶ 검색유입 + 유입 키워드 ──▶ 제목 디벨롭 ──▶ yt-seo 메타 갱신 / 다음 영상 제목 피드백
   ▼ 베스트 분석 후 ──▶ 변경: 고정댓글 · 재생목록 · 최종화면 · 쇼츠 관련영상
        └▶ 1군이면 슈퍼콘텐츠 디벨롭 (다음 사이클로)
```

- **시점이 변수다.** 24시간엔 *탐색유입*만 보고 **썸네일**을 판단하고, 7일엔 *검색유입+키워드*를 보고 **제목**을 판단한다. 둘을 섞으면 무엇이 문제인지 분리가 안 된다(blueprint §⑦).
- **A/B 변수 분리가 학습을 만든다.** yt-thumbnail이 A/B/C를 서로 다른 6원칙으로 분기시켜 뒀으면, 24h 탐색 CTR로 **어느 시각 전략이 먹혔는지**를 인과로 배운다.
- **출력은 평가가 아니라 액션이다.** "CTR이 낮네요"로 끝내지 말고, "썸네일 A→비포애프터 강화로 재생성"처럼 **다음 행동**으로 환원한다(디벨롭 루프).

---

## When to Activate

다음 중 하나면 이 스킬을 켠다.

- 사용자가 **"성과 분석해줘"**, "이 영상 어땠어", "썸네일/제목 바꿔야 해?", "디벨롭 액션 뽑아줘"라고 할 때.
- 영상 발행 후 **24시간 / 7일** 체크포인트에 도달했을 때(권장 트리거).
- 여러 영상 중 **베스트(1군)를 가려 슈퍼콘텐츠로 디벨롭**하려 할 때.

영상을 새로 만들거나 메타를 처음 짜는 것은 이 스킬이 아니다(yt-script/yt-seo). 이 스킬은 **이미 발행된 것의 성과를 읽어 다음 행동으로 바꾼다.**

---

## 입력 (Inputs)

| 입력 | 출처 | 설명 | 없을 때 |
|---|---|---|---|
| **영상 ID/URL** | yt-seo 업로드 결과 | 분석 대상 | **필수** |
| **발행 후 경과 시점** | 사용자/시계 | 24h인지 7d인지 — 분석 분기 결정 | 없으면 1회 질문(둘 다면 둘 다) |
| **노출수·노출 CTR** | Analytics API / Studio | 썸네일 평가(24h) | OAuth 없으면 Studio 수치 수동 입력 요청 |
| **트래픽 소스 분해** | Analytics(`insightTrafficSourceType`) | 탐색(browse/suggested) vs 검색(search) | 수동 입력 폴백 |
| **유입 검색어** | Analytics(`insightTrafficSourceDetail`, search) | 7d 제목 디벨롭 원천 | 수동(Studio '트래픽 소스>YouTube 검색') |
| **유지율 곡선** | Analytics(`relativeRetentionPerformance`/`audienceWatchRatio`) | 도입부 유지 60%·평균시청 4분 평가 | 수동(Studio '시청 지속 시간') |
| **그 영상의 제작 메타** | yt-thumbnail(A/B변수)·yt-seo(제목·키워드·태그)·yt-script(핵심문제) | 인과 분리·디벨롭 대상 식별 | 없으면 영상 메타에서 역추출 |
| (선택) 비교군 | 채널 내 유사 영상 | 24h 탐색유입 상대 비교 | 단독 분석 + 절대 KPI로 판정 |

---

## 방법론 — 성과분석 3렌즈 (blueprint §⑦)

### ① 24시간 — 탐색유입 비교 → 썸네일 평가
- **탐색유입**(browse features + suggested)의 **노출수 대비 노출 CTR**을 본다. 탐색은 제목·썸네일이 *낯선 사람에게* 클릭당하는 영역 → **썸네일·제목 쌍의 후킹력** 신호.
- **판정:** 노출 CTR이 **10% 미만**이면(blueprint §0 절대 기준) 썸네일 후킹 약함 → 교체 후보. 비교군이 있으면 같은 채널 영상 대비 상대 비교로 보정.
- **A/B 인과:** yt-thumbnail이 A/B/C(서로 다른 6원칙)로 분기했으면, 어느 변수가 탐색 CTR을 끌었는지 기록 → 다음 영상 썸네일 전략으로 피드백.
- **액션:** CTR<10% → `yt-thumbnail` 재호출(약한 원칙을 강한 원칙으로 — 예: 인물형→비포애프터형)하고 영상 썸네일 즉시 교체.

### ② 발행 7일 — 검색유입 + 키워드 → 제목 디벨롭
- 7일이면 **검색유입**이 쌓인다. **유입 검색어**(어떤 쿼리로 들어왔나)를 본다.
- **판정:** (a) 의도한 메인키워드로 들어오는가? (b) 예상 못 한 검색어가 더 많은가(=실제 수요는 거기)? (c) 검색유입 자체가 빈약한가(=제목에 검색 키워드 부족)?
- **액션:** 실유입 검색어를 **제목 4법**(blueprint §②: 동일주제 문구조합·쉬운 동의어·상위어 확장·수식어 강조)으로 제목에 반영 → `yt-seo` 메타 갱신(제목·태그) + **다음 영상 제목**으로 피드백. 검색 수요는 구글트렌드로 재확인 권고.

### ③ 베스트 분석 후 — 즉시 변경 4종 + 1군 디벨롭
성과가 확인되면(특히 잘 나온 영상) 다음을 손본다(blueprint §⑦ 변경 대상):
- **고정댓글:** 유입·이탈 지점에 맞춰 행동제시 재작성(전환 약하면 증거자료형↔휘발성형 교체).
- **재생목록:** 잘 나온 영상을 재방문 동선에 배치 / 관련 영상 묶기(재방문 편의 = blueprint §⑥).
- **최종화면:** 다음(키)콘텐츠로 보내는 카드를 성과순으로 교체.
- **쇼츠 관련영상:** 풀링쇼츠 → 롱폼 전환 동선 점검(blueprint §2: 숏폼 터진 것 → 롱폼 성공률↑).
- **1군 판정(슈퍼콘텐츠 디벨롭):** CTR 10%+ / 도입부 유지 60%+ / 시청지속 35%+ 또는 4분+ / 조회 1000+ 중 상위. 충족 시 "슈퍼콘텐츠로 디벨롭" 플래그 → 다음 사이클 yt-structure/yt-radar 우선순위로 환류.

> **분석 관점 3(blueprint §⑦):** 현실 이식(데이터로 판단) / 기준 변화(목표 재설정) / 노력 루틴 재설정. 액션이 "더 열심히"가 아니라 **구체 변경·기준 조정**이 되게 한다.

---

## 외부 연동 — YouTube Analytics API (정직한 연동 명세)

- **무엇이 필요한가:** 노출·노출 CTR·트래픽 소스·유입 검색어·유지율은 **채널 소유자 전용 데이터**다. **YouTube Analytics API v2 + Data API v3, OAuth 2.0(채널 소유자 동의)** 필요. **API 키만으로는 못 읽는다.**
- **스코프(읽기 전용):** `https://www.googleapis.com/auth/yt-analytics.readonly`(+ 메타는 `youtube.readonly`).
- **핵심 쿼리(개념):**
  - 탐색 CTR/노출: `reports.query` metrics `impressions,impressionsClickThroughRate,views,estimatedMinutesWatched,averageViewPercentage` dimensions `insightTrafficSourceType` filter `video==<id>` (24h: startDate=endDate=발행+1일 범위).
  - 유입 검색어: metrics `views` dimensions `insightTrafficSourceDetail` filter `insightTrafficSourceType==YT_SEARCH;video==<id>`.
  - 유지율: dimensions `elapsedVideoTimeRatio` metrics `audienceWatchRatio,relativeRetentionPerformance`.
- **데이터 지연:** Analytics는 **수 시간~최대 ~72시간 지연**될 수 있다. "24시간 분석"은 데이터 안정화 시점을 감안해 보정한다.
- **이 환경에서:** 이 MCP 세션에 YouTube Analytics 도구는 **연결돼 있지 않다.** 따라서 (a) 사용자가 OAuth 토큰을 갖춘 로컬 스크립트로 수치를 뽑아 넣거나 (b) **YouTube Studio 분석 탭에서 수치를 수동 입력**한다. 이 스킬은 둘 다에 맞춰 "무슨 수치를 어디서 보면 되는지" 가이드하고, 받은 수치로 리포트·액션을 낸다.
- **시크릿 규칙:** OAuth 토큰·시크릿을 **출력·로그·저장 파일에 노출하지 않는다.** 읽기 전용 스코프만 요청한다.

---

## 출력 계약 (Output Contract)

아래 `ANALYZE REPORT` 블록을 산출한다. **분석 + 액션(즉시 변경 / 다음 영상 피드백)**을 분리해 낸다.

```
## ANALYZE REPORT
context:
  video: "<ID/URL>"
  checkpoint: "24h | 7d | best"
  data_source: "Analytics API(OAuth)" | "Studio 수동입력"
  core_problem: "<그 영상 핵심 문제 1문장>"
  kpi_target: "CTR 10% / 도입부유지 60% / 시청 4분(또는 35%) / 조회 1000+"

# ① 24h — 탐색유입 → 썸네일
thumbnail_eval:
  impressions: "<노출수>"
  browse_ctr: "<탐색 노출 CTR %>"  vs target "10%"
  verdict: "통과 | 약함 → 교체"
  ab_learning: "<A/B/C 중 어느 6원칙 변수가 CTR을 끌었나(있으면)>"
  action: "<yt-thumbnail 재생성 지시(약한→강한 원칙) / 또는 유지>"

# ② 7d — 검색유입 + 키워드 → 제목
title_eval:
  search_share: "<검색유입 비중>"
  inflow_queries: ["<실제 유입 검색어들>"]
  intended_vs_actual: "<의도 키워드 대비 실유입 차이>"
  verdict: "제목 적합 | 디벨롭 필요"
  action: "<제목 4법으로 제목/태그 갱신안 — yt-seo 메타 갱신 + 다음영상 제목 피드백>"

# 유지율(있으면)
retention:
  intro_60: "<도입부 ~30s 유지율> vs 60%"
  avg_watch: "<평균 시청시간/지속%> vs 4분/35%"
  drop_points: ["<큰 이탈 구간 — 다음 원고 보강 신호>"]

# ③ 베스트 후 즉시 변경 4종
changes:
  pinned_comment: "<재작성안 또는 유지>"
  playlist: "<재생목록 배치/묶기 제안>"
  end_screen: "<최종화면 카드 교체 제안>"
  shorts_link: "<쇼츠↔롱폼 동선 제안>"

# 1군 판정 → 디벨롭 루프
tier:
  is_super: yes | no
  reason: "<KPI 4종 대비 위치>"
  feed_forward: "<다음 사이클로 넘기는 피드백 — yt-structure/yt-radar/yt-thumbnail/yt-seo 각각 무엇을>"

quality_gate:
  lens_separation: "24h=썸네일 / 7d=제목 분리 지켰나"
  action_not_opinion: "모든 verdict에 구체 액션이 붙었나"
  secrets: "OAuth 토큰 미노출"
  confidence: confirmed | inferred(데이터 지연/수동입력 보정)
```

---

## 품질 게이트 (Quality Gates)

산출 전 점검한다. 하나라도 실패하면 고쳐 다시 통과시킨다.

- [ ] **렌즈 분리:** 24h는 **탐색유입→썸네일**, 7d는 **검색유입+키워드→제목**으로 분리했는가?(섞지 않았는가)
- [ ] 모든 판정(verdict)에 **구체 액션**이 붙었는가?("CTR 낮음"으로 끝내지 않았는가)
- [ ] 액션이 **즉시 변경(같은 영상)**과 **다음 영상 피드백**으로 갈렸는가?
- [ ] 24h 썸네일 판정이 **CTR 10% 절대기준**으로 내려졌는가?(비교군 있으면 상대 보정)
- [ ] A/B 변수(yt-thumbnail 6원칙 분기)가 있으면 **인과 학습**을 기록했는가?
- [ ] 베스트면 **변경 4종**(고정댓글·재생목록·최종화면·쇼츠)을 점검했는가?
- [ ] **1군(슈퍼콘텐츠) 판정**을 KPI 4종으로 내렸는가?
- [ ] 데이터 출처를 **정직하게**(Analytics OAuth vs Studio 수동) 표시하고, **데이터 지연**을 감안했는가?
- [ ] **OAuth 토큰·시크릿을 출력/로그에 노출하지 않았는가?**(읽기 전용 스코프만)

---

## Worked Example (간결)

**입력:** 영상 "어깨 넓히는 법" / 24h 체크포인트 / Studio 수동입력: 노출 12,000·탐색 CTR 6.5% / 썸네일 A(비포애프터)·B(궁금증) 중 A 발행.

```
## ANALYZE REPORT
context:
  video: "youtu.be/xxxx"
  checkpoint: "24h"
  data_source: "Studio 수동입력"
  core_problem: "헬스장 다녀도 어깨가 안 벌어진다"
  kpi_target: "CTR 10% / 유지 60% / 4분 / 조회 1000+"

thumbnail_eval:
  impressions: "12,000"
  browse_ctr: "6.5% vs target 10%"
  verdict: "약함 → 교체"
  ab_learning: "A(비포애프터) 발행했으나 6.5% — 비포애프터 대비 약함. B(궁금증 은폐) 미검증"
  action: "yt-thumbnail 재호출 — A의 비포애프터를 '확대+숫자 강조'로 강화하거나 B(궁금증)로 교체해 24h 재측정"

title_eval: { verdict: "7d 미도래 — 보류", action: "7일 시점에 검색유입/키워드로 재분석" }

retention: { intro_60: "(Studio 시청지속에서 확인 요)", avg_watch: "(확인 요)", drop_points: [] }

changes:
  pinned_comment: "유지(전환 데이터는 7d에 재판단)"
  playlist: "탐색 약하므로 재생목록 노출은 7d 이후"
  end_screen: "보류"
  shorts_link: "이 주제 풀링쇼츠 있으면 롱폼으로 연결 동선 추가 검토"

tier: { is_super: no, reason: "탐색 CTR 6.5% < 10% — 1군 아님(썸네일이 병목)", feed_forward: "yt-thumbnail: 비포애프터 단독보다 '확대+숫자' 강조 변수 우선 / yt-seo: 7d에 키워드 재검" }

quality_gate: { lens_separation: "24h=썸네일만 봄 ✔", action_not_opinion: "재생성 지시 명시 ✔", secrets: "토큰 미노출", confidence: inferred(수동입력·유지율 미확보) }
```

---

> 이 스킬은 "성과를 읽어 **다음 행동**으로 바꾸는" 루프 닫기 스킬이다. 평가로 끝내지 말고 즉시 변경·다음 영상 피드백으로 환원하라. 24h=썸네일/7d=제목 렌즈를 섞지 말고, CTR 10% 절대기준과 1군 KPI로 판정하라. Analytics는 OAuth 필요·데이터 지연을 정직히 밝히고, 없으면 Studio 수동입력으로 진행한다.
