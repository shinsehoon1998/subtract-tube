---
name: yt-voiceover
description: yt-script가 만든 페이스리스 롱폼 원고의 [나레이션] 세그먼트를 TTS로 음성 합성하는 스킬. 세그먼트별로 한국어 보이스로 mp3를 생성하고, 영어·약어·숫자를 한글 발음으로 교정하며, 호흡·속도·쉼을 세그먼트 단위로 제어한다. TTS 제공자는 기본 ElevenLabs(ELEVENLABS_API_KEY + voice_id)지만 Higgs generate_audio나 다른 엔진으로 교체 가능하게 추상화한다. 출력은 drafts/<project>/audio/seg-NN.mp3 + manifest.json(세그먼트↔파일↔길이)이며, 누락·길이·발음 품질게이트를 통과시킨다. yt-render의 오디오 입력을 만든다.
metadata:
  origin: 빼기연구소 (나는빼기연구소)
  pipeline: subtract-tube
---

# yt-voiceover — 페이스리스 롱폼 원고 → TTS 나레이션 음성

> 호출자: 빼기연구소 크리에이터(또는 subtract-tube 파이프라인의 음성 단계). 업스트림: `yt-script`(세그먼트 분할 원고). 다운스트림 소비자: `yt-render`(Remotion 조립 — 세그먼트별 오디오를 타임라인에 얹는다).
> 목적: 원고의 **`[나레이션]` 순수 대사만** TTS로 읽혀 세그먼트별 음성 파일을 만든다. 페이스리스 파이프라인의 "목소리" 절반(나머지 절반은 `yt-render`의 화면).
> 방법론 소스: `knowledge/biz-pt-longform-blueprint.md` §⑤ 촬영/편집(BGM·자막은 편집 몫, 음성은 그 전 단계). 이 스킬은 자체 포함(self-contained)이다.
> 크리에이터 확정 지시: **"페이스리스 간다"** — 얼굴·실제 음성 녹음 없이 TTS로만 나레이션을 만든다.

---

## When to Activate

다음 중 하나면 이 스킬을 켠다.

- `yt-script` 산출 원고(세그먼트 분할)가 준비됐고 **음성으로 바꿔달라**는 요청
- "이 대본 TTS로 읽어줘", "나레이션 음성 뽑아줘", "세그먼트별 mp3 만들어줘" 류
- subtract-tube 파이프라인에서 원고 단계 다음(렌더 직전) 음성 단계에 진입할 때

원고 작성 자체(`yt-script`), 화면·자막·렌더(`yt-render`)는 이 스킬의 범위가 아니다. 이 스킬은 **나레이션 음성 합성**만 한다.

---

## 입력 (Inputs)

| 입력 | 설명 | 없을 때 |
|---|---|---|
| **원고 (yt-script 산출)** | `## 세그먼트 N` + `[나레이션]`/`[화면큐]` 구조의 마크다운. `drafts/<project>/...-script.md` | **필수.** 없으면 진행 불가 — `yt-script`부터 받을 것 |
| **프로젝트 슬러그** | 출력 경로 `drafts/<project>/`의 `<project>` (예: `dogfood-ep01`) | 원고 파일명에서 `-script` 떼서 추정. 그래도 모호하면 1회 질문 |
| **TTS 제공자** | 기본 `elevenlabs`. 그 외 `higgs`, `custom` | 미지정 시 `elevenlabs`. 키 없으면 아래 폴백 |
| **보이스 식별자** | ElevenLabs `voice_id`(한국어 보이스) 또는 Higgs `voice_id`+`voice_type` | 없으면 "한국어 보이스 선택" 안내(아래 보이스 선정) |
| **글로벌 음성 톤** | 채널 프로파일(yt-channel) 말투에 맞춘 속도·톤·안정성 | 채널 프로파일 있으면 거기서, 없으면 기본 프리셋 |

---

## TTS 제공자 추상화 (Provider Abstraction)

엔진을 갈아끼울 수 있도록 **세 가지를 분리**한다: ① 세그먼트 텍스트(엔진 무관) ② 음성 파라미터(엔진별 매핑) ③ 합성 호출(어댑터). 어떤 엔진이든 입력은 "정제된 한국어 대사 1문단", 출력은 "mp3 파일 1개 + 길이(초)"로 동일하다.

```
세그먼트 텍스트 ──▶ [발음 정규화] ──▶ [음성 파라미터] ──▶ ⟨제공자 어댑터⟩ ──▶ seg-NN.mp3 + duration
                                                          ├─ elevenlabs (기본)
                                                          ├─ higgs (generate_audio)
                                                          └─ custom (사용자 엔진)
```

### 제공자 A — ElevenLabs (기본)

- **인증**: 환경변수 `ELEVENLABS_API_KEY` (필수). `voice_id`는 입력/환경변수 `ELEVENLABS_VOICE_ID`로 받는다. **키를 코드·원고·manifest에 하드코딩 금지** — 항상 env에서 읽는다.
- **키가 없을 때**: 합성을 시도하지 말고 아래를 안내한다.
  > "ElevenLabs API 키가 없습니다. `export ELEVENLABS_API_KEY=...` 설정 후, 한국어 보이스 `voice_id`도 `export ELEVENLABS_VOICE_ID=...`로 지정해 주세요. (대안: 제공자를 `higgs`로 지정하면 Higgs `generate_audio`로 바로 합성합니다.)"
- **모델**: 한국어는 `eleven_multilingual_v2`(품질) 또는 `eleven_turbo_v2_5`(저지연·저비용)를 쓴다. 기본 `eleven_multilingual_v2`.
- **호출(레퍼런스 — 셸/Node 둘 다 가능)**:

```bash
# 세그먼트 1개 합성 (텍스트는 정규화 후 주입)
curl -sS -X POST \
  "https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}" \
  -H "xi-api-key: ${ELEVENLABS_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "<정규화된 나레이션>",
    "model_id": "eleven_multilingual_v2",
    "voice_settings": { "stability": 0.45, "similarity_boost": 0.8, "style": 0.0, "use_speaker_boost": true }
  }' \
  --output "drafts/<project>/audio/seg-01.mp3"
```

- **속도**: ElevenLabs는 직접 speed 파라미터가 약하므로 호흡/속도는 ② SSML류 쉼 표기와 문장 길이로 제어하고, 필요하면 후처리(`ffmpeg atempo`)로 미세 조정한다.

### 제공자 B — Higgs (`generate_audio`, 연결됨)

키 없이 즉시 합성하고 싶을 때 사용한다. 이 환경에는 Higgs MCP가 연결돼 있다.

1. 보이스 탐색: `list_voices` → 한국어 가능한 `voice_id`+`voice_type`(`preset`/`element`) 쌍 확보.
2. 합성: `generate_audio({ model: "text2speech_v2_elevenlabs", prompt: "<정규화된 나레이션>", voice_type, voice_id })`.
   - 엔진 교체는 `model`만 바꾼다: `text2speech_v2_minimax` / `..._seed_speech` / `..._vibe_voice` / `..._cozy_voice`.
   - 비용 사전확인: 같은 호출에 `get_cost: true`.
3. 반환된 결과를 받아 `seg-NN.mp3`로 저장하고 길이를 측정한다.
4. 파라미터 상세는 `models_explore({ type: "audio" })`로 확인한다.

### 제공자 C — Custom

사용자가 자체 TTS(예: 로컬 모델, 타 API)를 쓰면, 어댑터 계약만 지키면 된다: **입력 = 정규화된 한국어 텍스트 + 음성 파라미터, 출력 = `seg-NN.mp3` + 길이(초)**. manifest의 `provider` 필드에 엔진명을 기록한다.

---

## 음성 파라미터 — 세그먼트별 호흡·속도·톤

음성을 "그냥 읽기"가 아니라 **세그먼트의 역할에 맞춰** 조절한다. 채널 프로파일 말투가 최상위 기준이며, 그 위에서 세그먼트 유형별로 미세조정한다.

| 세그먼트 유형 | 속도 | 호흡/쉼 | 톤(stability) |
|---|---|---|---|
| 도입부(후킹) | 약간 빠르게 | 첫 문장 뒤 짧은 쉼으로 긴장 | 낮게(0.35~0.45) = 표현력↑ |
| 정보/본문 | 보통 | 문장 단위로 안정적 쉼 | 중간(0.5) = 또렷함 |
| 개인가치/권위 | 살짝 느리게 | 자격 문구 앞에 한 박자 쉼 | 높게(0.6) = 신뢰감 |
| 마무리/CTA | 보통~약간 느리게 | 행동제시 앞 쉼 | 중간(0.5) |

**호흡·쉼 표기 규칙**: 원고의 자연 문장부호(`.`, `,`, `…`)를 쉼으로 신뢰한다. 추가 쉼이 필요하면 정규화 단계에서 `…`(긴 쉼) 또는 줄바꿈을 넣는다. ElevenLabs는 `<break time="0.4s"/>` SSML도 지원한다(보수적으로만 사용).

**속도 미세조정(엔진 무관 후처리)**: 합성 후 `ffmpeg -i seg-NN.mp3 -filter:a "atempo=0.95" out.mp3`로 ±0.85~1.15 범위에서 조절. 1.0 밖으로는 음질 저하 주의.

---

## 발음 교정 (Pronunciation Normalization) — 합성 전 의무

`[나레이션]`은 사람이 읽을 글이라 TTS가 틀리기 쉬운 토큰이 섞여 있다. **합성 직전, 원본 원고는 건드리지 말고** 정규화된 사본을 만들어 엔진에 넣는다(불변 원칙 — 원고 파일 mutate 금지).

교정 대상과 규칙:

1. **영어 단어 → 한글 발음**: `Claude Code` → `클로드 코드`, `YouTube` → `유튜브`, `API` → `에이피아이`, `AI` → `에이아이`, `URL` → `유알엘`, `SEO` → `에스이오`, `TTS` → `티티에스`.
2. **약어/이니셜리즘**: 한 글자씩 한글로 풀어 읽기. `CTR` → `씨티알`, `CTA` → `씨티에이`, `mp3` → `엠피쓰리`.
3. **숫자·단위**: 문맥에 맞는 한국어 수사로. `3000자` → `삼천 자`, `60%` → `육십 퍼센트`, `2개` → `두 개`, `4분` → `사 분`. (서수/기수 구분: "311경기" → "삼백십일 경기".)
4. **기호**: `&` → `그리고`/`앤드`, `→` → (읽지 않음, 쉼으로 처리), `±5%` → `플러스마이너스 오 퍼센트`.
5. **혼동 발음 오버라이드**: 채널 고유명사·외래어 중 TTS가 자주 틀리는 것을 프로젝트별 발음 사전에 적재해 일괄 치환. 예: `빼기연구소`(정상), `Higgs` → `힉스`, `Remotion` → `리모션`.

발음 사전은 `drafts/<project>/audio/pronunciation.json`에 누적한다(프로젝트 간 공통어는 전역 사전으로 승격 가능).

```json
{ "Claude Code": "클로드 코드", "Higgs": "힉스", "Remotion": "리모션", "CTR": "씨티알", "SEO": "에스이오" }
```

---

## 처리 순서 (Pipeline)

1. **파싱**: 원고에서 `## 세그먼트 N` 블록을 순서대로 추출, 각 블록의 `[나레이션]` 본문만 취한다(`[화면큐]`는 버린다 — 그건 `yt-render` 몫).
2. **정규화**: 세그먼트별로 발음 교정 사본 생성(원본 불변).
3. **파라미터 결정**: 세그먼트 위치/역할로 위 표의 속도·호흡·톤 매핑.
4. **합성**: 선택한 제공자 어댑터로 `seg-NN.mp3` 생성(NN은 01부터 0패딩 2자리; 100개 이상이면 3자리).
5. **길이 측정**: `ffprobe -v error -show_entries format=duration -of csv=p=0 seg-NN.mp3`로 초 단위 길이 확보.
6. **manifest 기록**: 아래 스키마로 누적.
7. **품질게이트**: 전 세그먼트 통과 확인. 실패 항목은 재합성.

> 구현 메모: 세그먼트가 많으면 순차로(레이트리밋·비용 통제) 처리하고, 실패한 세그먼트만 재시도하는 멱등(idempotent) 구조로 짠다 — 이미 존재하고 manifest에 OK로 기록된 `seg-NN.mp3`는 건너뛴다.

---

## 출력 계약 (Output Contract)

디렉터리:

```
drafts/<project>/audio/
├── seg-01.mp3
├── seg-02.mp3
├── ...
├── seg-NN.mp3
├── pronunciation.json     # 프로젝트 발음 사전
└── manifest.json          # 세그먼트 ↔ 파일 ↔ 길이 (yt-render가 소비)
```

`manifest.json` 스키마 — **`yt-render`가 그대로 읽어 타임라인을 조립한다**:

```json
{
  "project": "dogfood-ep01",
  "provider": "elevenlabs",
  "voice_id": "<env에서 읽은 값, 마스킹 가능>",
  "model_id": "eleven_multilingual_v2",
  "total_segments": 12,
  "total_duration_sec": 312.4,
  "segments": [
    {
      "index": 1,
      "file": "seg-01.mp3",
      "duration_sec": 27.8,
      "narration_normalized": "남들 다 헬스장만 다닐 때, 이것 하나로...",
      "char_count": 142,
      "speed": 1.05,
      "tone": "intro",
      "status": "ok"
    }
  ]
}
```

규칙:
- `index`는 원고의 세그먼트 번호와 **1:1 일치**. 누락/순서 어긋남 금지.
- `duration_sec`는 실측값(추정 금지) — `yt-render`가 자막 동기화·클립 길이에 쓴다.
- `narration_normalized`는 합성에 실제 들어간 텍스트(자막 폴백용으로도 유용).
- API 키 같은 비밀은 manifest에 평문 저장 금지(필요시 마스킹).

---

## 품질 게이트 (Quality Gates)

내보내기 전 자동 점검한다. 하나라도 실패하면 고쳐 재통과.

- [ ] **누락 없음**: 원고 세그먼트 수 == `seg-*.mp3` 수 == manifest `segments` 수. 빠진 인덱스 0개.
- [ ] **재생 가능**: 각 mp3가 0초 초과이고 `ffprobe`로 디코딩됨(빈 파일/깨진 파일 0개).
- [ ] **길이 합리성**: 세그먼트별 길이가 글자 수 대비 비정상(너무 짧음=합성 누락, 너무 김=속도 오류)이 아닌가? 대략 한국어 4~6자/초 기준 ±50% 밖이면 경고·재확인.
- [ ] **발음 교정 적용**: 영어/약어/숫자가 정규화되었는가? `narration_normalized`에 미정규 영문 대문자 토큰이 남아 있으면 실패.
- [ ] **순수 대사만**: 무대 지시·괄호 설명·`[화면큐]` 텍스트가 음성에 섞이지 않았는가?
- [ ] **합계 분량 의식**: `total_duration_sec`가 목표 영상 길이(원고 3000자 기준 대략 8~12분)와 어긋나면 보고.

---

## 사용자 준비 / 연동 (Setup)

- **ElevenLabs(기본) 쓸 때**: `export ELEVENLABS_API_KEY=...` + 한국어 `voice_id`를 `export ELEVENLABS_VOICE_ID=...`로. (보이스는 ElevenLabs 대시보드 Voice Library에서 한국어 지원 보이스 선택 → ID 복사.)
- **Higgs 쓸 때**: 추가 키 불필요(MCP 연결됨). `list_voices`로 한국어 보이스 `voice_id`+`voice_type` 고르면 됨.
- **공통 로컬 도구**: `ffmpeg`/`ffprobe` 설치 권장(길이 측정·속도 후처리). 없으면 길이 측정은 엔진 응답 메타로 대체.

---

> 이 스킬은 "음성 합성"만 책임진다. 자막·BGM·화면 합성은 `yt-render`로 넘긴다. 모든 산출물은 세그먼트 1:1 일치·발음 교정·실측 길이·manifest 계약을 지킨다.
