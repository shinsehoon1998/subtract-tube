# radar — 1~4단계 소싱 자동화 (하이브리드)

지정 해외 유튜버 신규 콘텐츠를 **자동 수집·채점**해 **노션 DB에 적재** → 사람이 검토 후 **래퍼런스 URL 채택(상태=승인)** → **5단계(yt-script)** 자동 진행.
설계 전문: `../../knowledge/sourcing-automation-design.md`

## 구성
| 모듈 | 방식 | 역할 |
|---|---|---|
| `src/fetch-uploads.mjs` | **API** | YouTube Data API로 지정 채널 신규 업로드 + 통계 수집 ✅검증 |
| `src/fit-prompt.mjs` | Claude | 채널 프로파일 대비 적합도 채점 프롬프트 생성(`claude -p` 입력) |
| `src/score.mjs` | 로컬 | 종합점수(fit·성과도·기여도·views) 가중합 ✅검증 |
| `src/notion.mjs` | **API** | 노션 DB upsert(URL 중복 방지) |
| `src/collect.mjs` | — | 후보+적합도 병합 → 노션 적재 오케스트레이터 |
| `src/viewtrap/collect-hotvideos.mjs` | **브라우저** | 뷰트랩 핫비디오 성과도/기여도 수집(Playwright, 셀렉터 검증 필요) |

## 셋업 (가동 전 사용자 입력 2가지)
1. **지정 채널** — `config/radar-channels.yaml`에 모니터링할 해외 유튜버(@handle/UC.../URL) 기입.
2. **노션 자격증명** — 노션 통합 토큰 발급 + 후보 DB 생성(스키마는 설계문서 §4) 후 `cp .env.example .env` 하고 `NOTION_TOKEN`·`NOTION_RADAR_DB_ID` 채우기. DB를 통합에 '연결'까지.
   - `YOUTUBE_API_KEY`는 `빼기연구소/.env` 재사용(추가 설정 불필요).
3. (뷰트랩 쓸 때) `npx playwright install chromium` 후 `node src/viewtrap/collect-hotvideos.mjs --login`로 1회 로그인.

## 실행 순서 (1단계 데일리)
```bash
# 1) 신규 업로드 수집 (Data API)
node src/fetch-uploads.mjs                      # → data/candidates-<date>.json

# 2) 적합도 채점 (구독 활용: claude -p)
node src/fit-prompt.mjs data/candidates-<date>.json | claude -p > data/fit-<date>.json

# 3) 노션 적재 (후보 + 적합도)
node src/collect.mjs data/candidates-<date>.json data/fit-<date>.json
```
2·4단계(뷰트랩): `node src/viewtrap/collect-hotvideos.mjs --keyword="herk ai automation"` → `node src/collect.mjs data/viewtrap-<date>.json`

## 검수 → 5단계
노션에서 종합점수순 검토 → 채택 행 **상태=승인** + URL. 워처 cron이 승인 감지 시 그 URL을 yt-script(5단계)에 투입(트리거는 3차 빌드).

## 상태
- ✅ **API-first(수집·채점) 구현·실측** — 실제 채널 12건 수집, scoring 랭킹 검증.
- 🟡 노션 적재 — 코드 완성, `NOTION_TOKEN`/DB 입력 시 가동.
- 🟡 뷰트랩 브라우저 — 스캐폴드 완성, 로그인 세션 + 셀렉터 실DOM 검증 필요.
- ⬜ 상태=승인 → 5단계 워처 cron.
