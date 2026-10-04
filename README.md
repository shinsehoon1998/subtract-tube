# subtract-tube

> 빼기연구소 유튜브 자동화 — **비즈니스PT 방법론을 인코딩한 페이스리스 롱폼 제작 스킬 묶음**
> Claude Code 플러그인. 주제 소싱부터 업로드·성과분석까지 10단계를 스킬로 나눠 담았습니다.

---

## 설치

Claude Code에서:

```
/plugin marketplace add shinsehoon1998/subtract-tube
/plugin install subtract-tube
```

설치 후 `/yt-longform`, `/yt-script` 처럼 스킬을 바로 호출할 수 있습니다.

> 로컬 클론으로 쓰려면: `git clone https://github.com/shinsehoon1998/subtract-tube.git` 후
> `/plugin marketplace add ./subtract-tube`

---

## 스킬 10종 — 파이프라인 순서

| 단계 | 스킬 | 하는 일 |
|:---:|---|---|
| 0 | **yt-channel** | 내 채널을 학습해 구독자 페르소나·말투·컨셉 `CHANNEL PROFILE` 생성. 1회 구축 + 월 1회 재학습. 모든 하위 스킬의 톤 기준. |
| 1 | **yt-radar** | 해외 유튜버 신규 업로드를 RSS로 감지 → 자막 추출 → 한국 시장·정서로 **현지화한 주제**를 큐에 적재. ("무엇을 말할까") |
| 2 | **yt-structure** | 뷰트랩으로 선별한 **국내 떡상 영상**에서 제목/썸네일·도입부·본문·CTA **구조**를 요소별로 추출. ("어떻게 말할까") |
| 3 | **yt-script** | 채널 프로파일 + 주제 + 구조 → `[나레이션]`/`[화면큐]` 세그먼트 롱폼 원고. 11유형 후킹·결(結) 일치·고정댓글 포함. |
| 4 | **yt-thumbnail** | 이미지 디벨롭 6원칙 → Higgsfield로 썸네일 후보 생성. 절대 기준 **CTR 10%**. |
| 5 | **yt-voiceover** | `[나레이션]`만 TTS로 합성 (ElevenLabs 기본). 영어·약어·숫자 한글 발음 교정. → `seg-NN.mp3` + `manifest.json` |
| 6 | **yt-render** | 화면큐 + 음성 → 자막(키워드 강조)·B-roll·강조 모션을 **Remotion**으로 합성 → `final.mp4` |
| 7 | **yt-seo** | 검색 SEO 4종(세일즈 키워드 제목 / 해시태그+메인키워드 3회 / 챕터 키워드 / 히든태그) 메타 패키지 + (OAuth 시) 업로드. |
| 8 | **yt-analyze** | 24시간 탐색유입 → 썸네일 평가, 7일 검색유입 → 제목 디벨롭. 다음 영상으로 넘기는 피드백 액션. |
| ★ | **yt-longform** | 위 전부를 **한 번에** 돌리는 오케스트레이터. `/yt-longform "<주제>"` |

### 핵심 설계 — 짜집기(bricolage)

> **콘텐츠(주제)는 트렌드가 빠른 해외에서, 구조(틀)는 국내 떡상 영상에서.**
> 벤치마크는 "한 영상 통째"가 아니라 **요소마다 가장 잘하는 다른 영상에서 따로** 소싱합니다.
> 최종 보이스는 항상 `yt-channel`의 채널 프로파일로 덮어씁니다.

```
yt-channel (내 보이스)
     │
     ├── yt-radar ──────┐
     │  해외=주제        ├──> yt-script ──> yt-voiceover ──> yt-render ──> yt-seo ──> yt-analyze
     └── yt-structure ──┘         │                                          │
        국내=구조                  └── yt-thumbnail                          └─ 피드백 환류
```

### 휴먼 게이트 3곳

`yt-longform` 오케스트레이터는 다음 지점에서 멈추고 사람 승인을 받습니다.

1. 뷰트랩 영상 선별 (구조 소스 고르기)
2. 원고 사실검증
3. 발행 승인

---

## 저장소 구성

```
skills/              # 스킬 10종 (SKILL.md) — 이 저장소의 본체
.claude-plugin/      # plugin.json + marketplace.json
config/              # channel-profile.md 등 채널 설정
radar/src/           # 1~4단계 소싱 자동화 (수집·채점·노션 적재·자막 재조합)
remotion/src/        # 렌더 컴포지션 + 모션 그래픽 레지스트리
drafts/              # 원고 작업물
published/           # 발행 완료 영상의 원고·썸네일·메타데이터 (mp4는 제외)
```

> 용량 때문에 제외된 것: `node_modules/`, `remotion/out/`, `remotion/public/`,
> `radar/data/`(higgs-notes 제외), 모든 `*.mp4`.

---

## 환경 변수

`radar/.env.example`를 `radar/.env`로 복사해 채웁니다.

| 키 | 용도 |
|---|---|
| `YOUTUBE_API_KEY` | Data API — 채널 업로드·조회 지표 수집 |
| `ELEVENLABS_API_KEY` + voice_id | 나레이션 TTS |
| `HIGGSFIELD_*` | 썸네일·B-roll 이미지/영상 생성 |
| `NOTION_API_KEY` + DB id | 주제 큐 적재 |

> **키는 절대 커밋하지 마세요.** `.env`는 `.gitignore`에 들어 있습니다.

---

## 로컬 기동

```bash
# radar 서버
cd radar && RADAR_PORT=5181 node src/server.mjs

# remotion 렌더
cd remotion && npx remotion render SubtractVideo out/video.mp4
```

---

## 라이선스

빼기연구소 내부 사용. 재배포·상업적 이용은 사전 동의 필요. [LICENSE](./LICENSE) 참고.
