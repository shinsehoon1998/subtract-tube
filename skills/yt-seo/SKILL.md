---
name: yt-seo
description: 유튜브 롱폼 발행을 위한 SEO 메타데이터 패키지를 생성하는 운영 스킬. 완성 원고/제목/주제/키워드를 입력받아 비즈니스PT 검색 SEO 4종(① 제목 앞 세일즈 키워드 ② 설명란 최상단 해시태그 5개 + 메인키워드 3회 이상 ③ 챕터 설명에 키워드 ④ 히든태그)으로 메타데이터를 짜고, 가능하면 YouTube Data API videos.insert로 업로드까지 한다(OAuth 필요). 사용자가 "SEO 짜줘", "설명란/태그 만들어줘", "업로드 메타 만들어줘/올려줘"라고 할 때 활성화.
metadata:
  origin: 빼기연구소 (나는빼기연구소)
  pipeline: subtract-tube
---

# yt-seo — 검색 SEO 4종 메타데이터 패키지 + (OAuth 시)업로드 (운영 ②)

> 호출자: 빼기연구소 크리에이터(또는 subtract-tube 파이프라인 운영 단계). 원고가 끝나고 영상이 렌더된 뒤, **발행 직전 메타데이터를 짜고(가능하면) 올리는** 스킬.
> 상위 입력: `yt-script`가 원고 끝에 함께 낸 **제목 후보 / 설명란 초안 / 고정댓글 초안**, 영상 **주제·핵심 문제 1문장 / 키워드**, `yt-channel`의 `CHANNEL PROFILE`(타겟 니즈 = 검색 의도 판단), `yt-thumbnail`의 선택 썸네일.
> 다운스트림 소비자: 업로드된 영상은 `yt-analyze`가 24h/7d 성과를 읽어 디벨롭 루프로 환류한다. 이 스킬의 `keywords`·`title`은 yt-analyze가 "검색유입 vs 키워드"를 비교하는 기준이 된다.
> 내부 소스 오브 트루스: `knowledge/biz-pt-longform-blueprint.md`(§⑥ 업로드/SEO — 설명란 해시태그 최상단·5개, 검색 SEO 4종, 콘텐츠 격차 로직 / §0 KPI). 이 스킬은 그 방법론을 자체 포함(self-contained)한다.
> 외부 연동: **YouTube Data API v3 `videos.insert` — OAuth 2.0 필요(API 키만으로는 업로드 불가).** 인증이 없으면 **메타데이터 패키지까지만** 내고 수동 업로드 가이드를 붙인다.

---

## 핵심 전제 — 이 스킬의 자리

```
[원고/제목/썸네일 확정] yt-script + yt-thumbnail
        │  + 주제/키워드 + yt-channel(검색 의도)
        ▼
   yt-seo ──(검색 SEO 4종)──▶ 메타데이터 패키지 ──(OAuth 있으면)──▶ videos.insert 업로드
                                       └(OAuth 없으면)──▶ 패키지 + 수동 업로드 체크리스트
```

- **메타데이터는 "검색유입 + 추천 알고리즘"을 동시에 노린다.** 설명란 해시태그는 검색·구매욕구 유입을, 5개 제한은 추천 알고리즘을 의식한 것이다(blueprint §⑥).
- **결(結) 일치는 여기서도 유효.** 제목·설명·챕터·태그가 전부 **핵심 문제 1문장**을 향해야 검색으로 들어온 사람이 이탈하지 않는다.
- **업로드는 선택이지 필수가 아니다.** OAuth가 없으면 패키지(복붙 가능한 텍스트)만 내고, 사람이 YouTube Studio에 붙여 올린다. 키/토큰을 정직하게 다룬다.

---

## When to Activate

다음 중 하나면 이 스킬을 켠다.

- 사용자가 **"SEO 짜줘"**, "설명란/태그 만들어줘", "업로드 메타데이터 만들어줘", "이 영상 올려줘"라고 할 때.
- subtract-tube 파이프라인에서 썸네일(yt-thumbnail)까지 끝나고 **발행** 단계에 진입할 때.
- 발행 후 `yt-analyze`가 "7일 검색유입/키워드 보니 제목·태그를 바꿔라"를 권고했을 때(메타 갱신 루프).

원고·제목 *문구*를 새로 창작하는 것은 yt-script의 몫이다. 이 스킬은 **확정 원고를 검색 최적화된 메타데이터로 패키징**하고 (가능하면) 올린다.

---

## 입력 (Inputs)

| 입력 | 출처 | 설명 | 없을 때 |
|---|---|---|---|
| **완성 원고** | yt-script 세그먼트 출력 | 설명란·챕터·키워드 추출 원천 | **필수.** 없으면 진행 불가 |
| **제목 후보** | yt-script 끝 산출 | 세일즈 키워드 앞 배치 대상 | 없으면 주제·문제로 1개 생성 |
| **핵심 문제 1문장 / 주제** | yt-script / yt-channel | 결 일치 기준점 + 메인키워드 추출 | 없으면 1회 질문 |
| **키워드 후보** | 사용자 / 구글트렌드 '유튜브검색' | 검색 수요 있는 메인·서브 키워드 | 없으면 원고에서 추출 + "구글트렌드로 수요 확인" 권고 |
| **타겟 니즈** | yt-channel `audience.needs` | 검색 의도(구매욕구 높은 검색어) 판단 | 없으면 원고 톤으로 추정 |
| **영상 파일 경로** | 사용자 | videos.insert 업로드용(업로드할 때만) | 없으면 패키지만 |
| **선택 썸네일** | yt-thumbnail | thumbnails.set용(OAuth 시) | 없으면 업로드 후 수동 |
| (선택) 챕터 타임스탬프 | 렌더/사용자 | 챕터 설명에 키워드 박기 | 없으면 챕터 스킵 + 안내 |
| (선택) 공개 설정·예약 | 사용자 | public/unlisted/private·예약시각 | 기본 비공개(private)로 올려 검수 후 공개 권장 |

---

## 방법론 — 검색 SEO 4종 (blueprint §⑥, 16주차)

검색 유입을 만드는 4개 레버를 모두 채운다.

### ① 제목 앞쪽에 세일즈 키워드
- 제목 **맨 앞**에 검색 수요 높은 핵심 키워드(세일즈 키워드)를 배치한다.
- yt-script 제목 후보의 결을 유지하되, 검색어를 앞으로 당긴다.
  - 예: "평범한 사람이 어깨 벌어진 3가지 방법" → "어깨 넓히는 법 | 평범한 사람이 어깨 벌어진 3가지 방법"
- **쉬운 동의어/상위어**(blueprint §②): 검색 수요가 더 많은 단어로 교체(한자·영어·전문어 → 초등학생 수준 + 검색량 많은 쪽).

### ② 설명란 최상단에 해시태그 — **5개만**, 그리고 메인키워드 3회 이상
- **해시태그는 설명 맨 앞쪽(최상단)에 배치** → 구매욕구 높은 검색유입 전환↑.
- **정확히 5개만.** 5개 초과는 추천 알고리즘에 역효과(blueprint 명시).
- 설명 본문에 **메인키워드를 자연스럽게 3회 이상** 노출(과도한 키워드 스터핑 금지 — 문장으로).
- 키워드 수요는 **구글트렌드 '유튜브 검색' 쿼리**로 확인(스킬은 추천 키워드를 내되, 실수요 확정은 사람 몫으로 안내).

### ③ 챕터 설명에 키워드
- 챕터(타임스탬프)가 있으면 각 챕터 라벨에 **키워드를 박는다**("00:00 시작"이 아니라 "00:00 어깨 안 벌어지는 진짜 이유").
- 챕터는 시청 지속(4분+ KPI)에도 기여 — 보고 싶은 구간으로 점프하게.

### ④ 히든태그(후보 키워드)
- 영상 태그(tags 필드)에 **후보 키워드**를 넣는다 — 화면엔 안 보이지만 검색 보조.
- 메인키워드 + 동의어 + 상위어 + 오타·구어 변형을 섞는다.
- **콘텐츠 격차 로직**(blueprint §⑥): 상위노출 영상의 업로드 날짜·구독자 수·퀄리티(길이·편집)를 보고 내가 비집을 틈이 있는 키워드를 고른다(있으면 메모).

> 고정댓글(yt-script 산출)도 함께 패키징해, 발행 즉시 고정할 수 있게 낸다(설득·행동제시는 yt-script가 이미 만든 것을 옮긴다).

---

## 외부 연동 — YouTube Data API videos.insert (정직한 연동 명세)

- **무엇이 필요한가:** 영상 업로드는 **OAuth 2.0 사용자 인증이 반드시 필요**하다. **단순 API 키로는 업로드(videos.insert)가 불가능**하다(읽기 일부만 키로 가능). 본인 채널에 올리는 쓰기 작업이므로 채널 소유자 동의(OAuth) 필수.
- **스코프:** `https://www.googleapis.com/auth/youtube.upload`(업로드) + 썸네일/메타 수정 시 `https://www.googleapis.com/auth/youtube` / `youtube.force-ssl`.
- **흐름(개념):**
  1. Google Cloud 프로젝트에서 **YouTube Data API v3 사용 설정** + **OAuth 클라이언트(Desktop/Web)** 생성.
  2. OAuth 동의 → **refresh token** 확보(시크릿으로만 보관, 코드·로그·산출물에 노출 금지).
  3. `videos.insert`(part=snippet,status) 멀티파트 업로드: snippet(title·description·tags·categoryId·defaultLanguage) + status(privacyStatus·publishAt 예약 시).
  4. (선택) `thumbnails.set`(videoId, 선택 썸네일) — OAuth 동일 스코프.
  5. (선택) `commentThreads.insert`로 고정댓글 게시 후 Studio에서 고정(고정 자체는 API 제약 있어 수동 권장).
- **할당량 주의:** `videos.insert`는 호출당 **약 1,600 quota units**(일일 기본 10,000)로 무거움 — 하루 업로드 횟수 제한적. 실패 시 재시도·다음날 재시도 안내.
- **이 환경에서:** 이 MCP 세션에는 YouTube 업로드 도구가 **연결돼 있지 않다.** 따라서 실제 업로드는 (a) 사용자가 OAuth 토큰을 갖춘 로컬 스크립트/도구로 실행하거나 (b) **YouTube Studio 수동 업로드**로 한다. 이 스킬은 그 둘 다에 바로 쓰도록 **복붙 가능한 메타데이터 + 업로드 체크리스트 + (요청 시)videos.insert 호출용 JSON 바디**를 낸다.
- **시크릿 규칙:** client_secret·refresh_token·access_token을 **출력·로그·저장 파일에 절대 쓰지 않는다.** 환경변수/시크릿 매니저로만 받는다.

---

## 출력 계약 (Output Contract)

아래 `SEO PACKAGE` 블록을 산출한다. **그대로 복붙해 YouTube Studio에 넣거나, videos.insert 바디로 변환**할 수 있게 한다.

```
## SEO PACKAGE
context:
  core_problem: "<핵심 문제 1문장 — 결 기준점>"
  main_keyword: "<세일즈/메인 키워드>"
  search_intent: "<yt-channel needs 기반 검색 의도 한 줄>"
  upload_path: "OAuth videos.insert" | "manual(YouTube Studio)"   # 연동 가능 여부

# ① 제목 — 세일즈 키워드 앞쪽
title: "<메인키워드 | 결 일치 제목>"
title_notes: "쉬운 동의어/상위어로 검색수요 큰 단어 적용 여부"

# ② 설명란 — 해시태그 5개 최상단 + 메인키워드 3회+
description: |
  #해시1 #해시2 #해시3 #해시4 #해시5      ← 정확히 5개, 최상단
  <메인키워드를 자연스럽게 3회+ 포함한 설명 본문>
  <출처/참고 채널, 챕터, 고정 안내 등>

# ③ 챕터 — 키워드 박은 라벨
chapters:
  - "00:00 <키워드 박은 라벨>"
  - "MM:SS <...>"     # 타임스탬프 없으면 "(챕터 보류 — 타임스탬프 필요)"

# ④ 히든태그(tags 필드)
tags: ["<메인>", "<동의어>", "<상위어>", "<구어/오타 변형>", ...]
gap_note: "콘텐츠 격차 — 상위영상 날짜/구독자/퀄리티 대비 비집을 틈(있으면)"

# 고정댓글(yt-script 산출 이관)
pinned_comment: "<행동제시 고정댓글>"

# 업로드 바디(videos.insert) — OAuth로 실행할 때 그대로 사용
insert_body:
  snippet: { title: "...", description: "...", tags: [...], categoryId: "<예: 27 교육/22 인물>", defaultLanguage: "ko" }
  status:  { privacyStatus: "private|unlisted|public", publishAt: "<예약 ISO8601, 옵션>", selfDeclaredMadeForKids: false }
  thumbnail: "<yt-thumbnail 선택 파일 — thumbnails.set로 별도>"

upload_or_guide:
  if_oauth: "videos.insert(part=snippet,status) 실행 → videoId → thumbnails.set → 검수 후 공개"
  if_manual:
    - "YouTube Studio 업로드 → 제목/설명/태그 위 값 붙여넣기"
    - "썸네일 업로드(yt-thumbnail 선택본)"
    - "챕터는 설명 본문에 타임스탬프로 (있을 때)"
    - "고정댓글 게시 후 고정"
    - "비공개로 올려 검수 → 공개/예약"

quality_gate:
  kpi: "조회 1000+ / CTR 10% / 검색유입 확보 의식"
  secrets: "OAuth 토큰·시크릿 미노출 확인"
  confidence: confirmed | inferred
```

---

## 품질 게이트 (Quality Gates)

산출 전 점검한다. 하나라도 실패하면 고쳐 다시 통과시킨다.

- [ ] **검색 SEO 4종**(제목 앞 세일즈키워드 / 해시태그 5개 최상단 / 챕터 키워드 / 히든태그)이 모두 채워졌는가?
- [ ] 설명란 해시태그가 **정확히 5개**이고 **최상단**에 있는가?(초과 금지)
- [ ] 메인키워드가 설명 본문에 **3회 이상** 자연스럽게 노출됐는가?(스터핑 아님)
- [ ] 제목 **맨 앞**에 세일즈 키워드가 왔는가?
- [ ] 제목·설명·챕터·태그가 **결(結) 일치**(핵심 문제 1문장)하는가?
- [ ] **업로드 경로를 정직하게** 표시했는가?(`videos.insert`는 OAuth 필요 — 키만으로 불가 명시)
- [ ] OAuth가 없으면 **수동 업로드 체크리스트**를 냈는가?(패키지만이라도 항상 산출)
- [ ] **시크릿(client_secret·refresh_token)을 출력/로그에 노출하지 않았는가?**
- [ ] 키워드 실수요는 **구글트렌드 확인을 사람에게 권고**했는가?(스킬은 후보만 단정 금지)
- [ ] KPI(조회 1000+/CTR 10%/검색유입)를 의식했는가?

---

## Worked Example (간결)

**입력:** 원고(어깨 넓히기) / 제목 후보 "평범한 사람이 어깨 벌어진 3가지 방법" / 핵심문제 "헬스장 다녀도 어깨가 안 벌어진다" / 키워드 후보 "어깨 넓히는 법, 승모근, 측면 삼각근" / OAuth 없음(수동).

```
## SEO PACKAGE
context:
  core_problem: "헬스장 다녀도 어깨가 안 벌어진다"
  main_keyword: "어깨 넓히는 법"
  search_intent: "운동 입문자가 '어깨 넓히는 법'을 검색 — 구체 루틴 원함"
  upload_path: "manual(YouTube Studio)"

title: "어깨 넓히는 법 | 평범한 사람이 어깨 벌어진 단 3가지 방법"
title_notes: "'측면 삼각근'(전문어) 대신 검색량 큰 '어깨 넓히는 법'을 맨 앞에"

description: |
  #어깨넓히는법 #어깨운동 #측면삼각근 #홈트 #헬스초보
  헬스장 다녀도 어깨가 안 벌어진다면, 무게가 아니라 각도 문제입니다. 이 영상은 어깨 넓히는 법을
  3가지로 정리했습니다. 평범한 사람도 어깨 넓히는 법은 같습니다. (국내 8만뷰 콘텐츠 참고)
  ▶ 루틴은 고정댓글에 정리했습니다.

chapters:
  - "00:00 헬스장 다녀도 어깨 안 벌어지는 진짜 이유"
  - "01:10 무게가 아니라 각도 — 측면 삼각근 자극"
  - "03:30 평범한 사람이 쓴 3가지 방법"

tags: ["어깨 넓히는 법","어깨운동","측면 삼각근","어깨 벌어지는법","숄더프레스","헬스 초보 어깨","홈트 어깨"]
gap_note: "상위영상 다수 2년 전 + 대형채널 — 최근/입문자 눈높이로 틈 있음"

pinned_comment: "어깨 벌어진 분들이 실제로 한 그 루틴, 여기 링크에 정리했어요. 영상 끝나면 바로 확인하고 오늘부터 해보세요."

insert_body:
  snippet: { title: "어깨 넓히는 법 | 평범한 사람이 어깨 벌어진 단 3가지 방법", description: "<위 설명>", tags: ["어깨 넓히는 법", ...], categoryId: "26", defaultLanguage: "ko" }
  status:  { privacyStatus: "private", selfDeclaredMadeForKids: false }
  thumbnail: "yt-thumbnail 후보 A"

upload_or_guide:
  if_manual:
    - "Studio 업로드 → 제목/설명/태그 붙여넣기 → 썸네일 A → 챕터(설명에 타임스탬프) → 고정댓글 고정 → 비공개 검수 후 공개"

quality_gate: { kpi: "조회1000+/CTR10%/검색유입 의식", secrets: "토큰 미노출", confidence: confirmed }
```

---

> 이 스킬은 "검색 SEO 4종으로 메타데이터를 패키징하고, 가능하면 올리는" 운영 스킬이다. 문구를 새로 창작하지 말고(yt-script 산출 이관) 검색 최적화에 집중하라. 업로드는 **OAuth 필요**임을 정직히 밝히고, 없으면 수동 체크리스트로 대체한다. 해시태그 5개·최상단, 시크릿 미노출은 타협 없이 지킨다.
