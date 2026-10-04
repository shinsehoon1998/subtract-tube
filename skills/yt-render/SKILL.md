---
name: yt-render
description: yt-script의 [화면큐] + yt-voiceover의 세그먼트 음성·manifest를 입력받아, 자막(키워드 강조)·B-roll/이미지·강조 모션을 합성해 최종 mp4를 렌더하는 페이스리스 조립 스킬. 렌더 엔진은 Remotion(React 코드로 영상 렌더)이며, 사용자가 북마크한 "클로드 코드 + Remotion 100% 자동 롱폼" 오픈소스의 포팅 가이드를 따른다. B-roll/이미지는 Higgs generate_image/generate_video로 생성(연결됨). 비즈니스PT 편집 코어 순서(컷→하이라이트 배치→효과/BGM/자막)를 반영한다. 출력은 drafts/<project>/render/final.mp4 + Remotion 프로젝트. Node+Remotion 환경 셋업 가이드 포함.
metadata:
  origin: 빼기연구소 (나는빼기연구소)
  pipeline: subtract-tube
---

# yt-render — 화면큐 + 음성 → 자막·B-roll·모션 합성 → 최종 mp4 (Remotion)

> 호출자: 빼기연구소 크리에이터(또는 subtract-tube 파이프라인의 렌더 단계, 마지막). 업스트림: `yt-script`(세그먼트 `[화면큐]`), `yt-voiceover`(`seg-NN.mp3` + `manifest.json`). 다운스트림: 업로드(`yt-upload`/수동).
> 목적: 페이스리스 영상의 "화면" 절반을 만든다 — 나레이션 음성에 **자막(키워드 강조) + B-roll/이미지 + 강조 모션**을 얹어 한 편의 mp4로 조립한다.
> 렌더 엔진: **Remotion** — React 컴포넌트로 영상 프레임을 선언하고 코드로 렌더(`@remotion/cli`)한다. 사용자가 북마크한 **"클로드 코드 + Remotion으로 롱폼을 100% 자동 생성"** 오픈소스 케이스를 이 파이프라인 산출물(세그먼트 구조)에 맞게 **포팅**한다.
> 방법론 소스: `knowledge/biz-pt-longform-blueprint.md` §⑤ 촬영/편집(편집 코어 순서: 밑작업=컷 → 하이라이트 순 배치 → 효과·BGM·자막). 이 스킬은 자체 포함(self-contained)이다.
> 크리에이터 확정 지시: **"페이스리스 간다"** — 얼굴 노출 없이 자막·B-roll·모션으로만 화면을 구성한다.

---

## When to Activate

다음 중 하나면 이 스킬을 켠다.

- 원고(`yt-script`)와 세그먼트 음성(`yt-voiceover`)이 둘 다 준비됐고 **영상으로 합쳐달라**는 요청
- "이걸로 영상 렌더해줘", "최종 mp4 뽑아줘", "Remotion 프로젝트 만들어줘", "자막 입혀줘" 류
- subtract-tube 파이프라인에서 음성 단계 다음(마지막) 렌더 단계에 진입할 때

원고(`yt-script`)·음성(`yt-voiceover`)·업로드(별도)는 이 스킬의 범위가 아니다. 이 스킬은 **화면 합성 + mp4 렌더**만 한다.

---

## 입력 (Inputs)

| 입력 | 설명 | 없을 때 |
|---|---|---|
| **원고 [화면큐] (yt-script)** | 세그먼트별 `자막 키워드` / `B-roll·이미지` / `강조` 지시 | **필수.** 화면 지시 없으면 자막+무지 배경만 렌더(저품질 경고) |
| **음성 manifest (yt-voiceover)** | `drafts/<project>/audio/manifest.json` + `seg-NN.mp3` | **필수.** 타임라인 길이의 기준. 없으면 진행 불가 |
| **프로젝트 슬러그** | `drafts/<project>/` (예: `dogfood-ep01`) | manifest의 `project` 사용 |
| **B-roll/이미지 소스** | 직접 제공 에셋, 또는 Higgs로 생성 | 없으면 `[화면큐]` 기반으로 Higgs 자동 생성 |
| **BGM / 브랜드 키트** | 배경음악, 로고·폰트·색상(채널 프로파일) | 없으면 BGM 생략(권장: 추가), 기본 디자인 토큰 사용 |
| **해상도/프레임** | 기본 1080p(1920×1080) 30fps. 쇼츠면 1080×1920 | 미지정 시 가로 1080p 30fps |

---

## 매핑 — 세그먼트 → Remotion 시퀀스

핵심 설계: **세그먼트 1개 = Remotion `<Sequence>` 1개.** manifest의 `duration_sec`로 각 시퀀스 길이를 정하고 누적해 전체 타임라인을 만든다. 한 세그먼트 안에서 4개 레이어를 합성한다.

```
세그먼트 N (manifest.segments[N])
 ├─ [오디오]   seg-NN.mp3                          ← yt-voiceover (길이의 기준)
 ├─ [B-roll]  화면큐 "B-roll/이미지" → Higgs 생성/제공 에셋  ← 배경 레이어
 ├─ [자막]    화면큐 "자막 키워드" → 캡션(키워드 강조)        ← 음성과 동기화
 └─ [모션]    화면큐 "강조" → 확대·하이라이트·전환            ← compositor 친화 transform/opacity
```

레이어별 규칙:

- **오디오**: `<Audio src={staticFile('audio/seg-NN.mp3')} />`. 세그먼트 시퀀스 길이 = `round(duration_sec * fps)` 프레임.
- **자막(키워드 강조)**: 기본 캡션은 `narration_normalized`(manifest)에서, **강조는 `[화면큐]`의 `자막 키워드`** 토큰을 다른 색/굵기/스케일로 칠한다. 단어 타이밍이 필요하면 `@remotion/captions`로 정렬하거나, 세그먼트 길이를 글자 수로 균등 분배(폴백).
- **B-roll/이미지**: `[화면큐]`의 `B-roll/이미지` 지시 → 에셋. 없으면 Higgs로 생성(아래). `<Img>`/`<Video>`/`<OffthreadVideo>`로 배경에 깔고 Ken Burns(완만한 scale/translate)로 정적 이미지에 생동감.
- **강조 모션**: `[화면큐]`의 `강조` → `spring()`/`interpolate()`로 숫자·키워드 확대(scale), 하이라이트(opacity·배경 박스), 세그먼트 경계 전환(fade/slide). **transform·opacity·clip-path만 애니메이트**(레이아웃 속성 금지 — compositor 친화).

---

## B-roll / 이미지 / 영상 생성 — Higgs (연결됨)

이 환경에는 Higgs MCP가 연결돼 있다. `[화면큐]`의 B-roll 지시를 에셋으로 만든다.

- **정지 이미지**: `generate_image`. 모델은 용도로 고르되(`models_explore(action:'recommend')` 권장), 다이어그램·텍스트 포함은 `nano_banana_pro`, 인물·에디토리얼은 `soul_2`, 비용 사전확인은 `get_cost:true`.
- **움직이는 B-roll**: `generate_video`(예 `kling3_0_turbo` 텍스트→영상, `seedance_2_0` 아이덴티티 유지). 세그먼트보다 약간 길게 뽑아 잘라 쓴다.
- **비포/애프터·증명 컷**: 썸네일 디벨롭 6원칙(비포-애프터, 시각적 증명)을 B-roll에도 적용.
- **결과 회수**: 생성 job 결과를 받아 `drafts/<project>/render/assets/`에 저장하고, 그 로컬 경로를 Remotion `staticFile`로 참조한다(원격 URL 직접 박지 말 것 — 렌더 안정성).
- **브랜드 일관성**: 채널 프로파일의 색/톤을 프롬프트에 반영해 에셋 룩을 통일한다.

> B-roll 지시가 빈약하면, 나레이션 의미를 요약한 키비주얼 1장(이미지)으로라도 채우고 Ken Burns로 움직임을 준다. "무지 배경 + 자막만"은 최후 폴백.

---

## 편집 코어 순서 반영 (비즈니스PT §⑤)

블루프린트의 편집 3단계를 렌더 파이프라인에 그대로 인코딩한다.

1. **밑작업 = 컷편집**: 세그먼트 = 컷. manifest 순서대로 `<Sequence>`를 from-offset 누적 배치(빈 구간·겹침 0).
2. **재미를 위한 순서 배치(하이라이트)**: 기본은 원고 순서. **단, 도입부(후킹) 세그먼트는 가장 강한 B-roll·모션·자막 강조를 배정**(도입부 유지율 60% 목표 직결). 필요하면 강조 강도를 세그먼트별로 차등(hook > 본문 > 마무리).
3. **효과·BGM·자막**: 전환(fade/slide)·강조 모션 → BGM(나레이션 아래 -18~-22dB 더킹) → 자막(키워드 강조) 순으로 레이어를 얹는다. 자막은 가독성(외곽선/그림자, 안전영역) 확보.

---

## Remotion 포팅 가이드 (오픈소스 → 이 파이프라인)

사용자 북마크 케이스("클로드 코드 + Remotion 100% 자동 롱폼")의 일반 구조를 이 파이프라인의 **세그먼트 + manifest 계약**에 맞춰 포팅한다. 핵심은 "원고/음성을 props로 주입받아 데이터 주도로 컴포지션을 그리는" 패턴이다.

### 프로젝트 구조 (생성물)

```
drafts/<project>/render/
├── remotion/
│   ├── package.json
│   ├── remotion.config.ts
│   ├── tsconfig.json
│   ├── src/
│   │   ├── Root.tsx              # <Composition> 등록 (durationInFrames = manifest 총길이)
│   │   ├── Video.tsx             # 세그먼트 배열 → <Sequence> 누적 합성
│   │   ├── components/
│   │   │   ├── SegmentScene.tsx  # 한 세그먼트(오디오+B-roll+자막+모션)
│   │   │   ├── Captions.tsx      # 자막 + 키워드 강조
│   │   │   ├── BRoll.tsx         # 이미지/영상 + Ken Burns
│   │   │   └── Emphasis.tsx      # 확대/하이라이트/전환
│   │   ├── lib/
│   │   │   ├── loadManifest.ts   # audio/manifest.json + 화면큐 → props
│   │   │   └── timeline.ts       # duration_sec → 프레임 오프셋 누적
│   │   └── styles/tokens.ts      # 색/폰트/간격 (채널 프로파일 디자인 토큰)
│   └── public/                   # staticFile 루트
│       ├── audio/  -> ../../audio (심볼릭/복사: seg-NN.mp3, manifest.json)
│       └── assets/               # Higgs/제공 B-roll·이미지
└── final.mp4                     # 렌더 결과
```

### 데이터 주도 컴포지션 (포팅의 핵심 패턴)

`manifest.json` + 원고 `[화면큐]`를 합쳐 **세그먼트 props 배열**을 만들고, `<Composition>`의 `durationInFrames`를 manifest 총 길이로 잡는다. 컴포넌트는 props만 보고 렌더하므로(컨테이너/프레젠테이션 분리) 영상이 데이터로 재현 가능하다.

```tsx
// Root.tsx (레퍼런스)
import { Composition } from "remotion";
import { Video } from "./Video";
import { buildProps } from "./lib/loadManifest";

const props = buildProps();           // manifest + 화면큐 → segments[]
const FPS = 30;

export const RemotionRoot = () => (
  <Composition
    id="SubtractTube"
    component={Video}
    durationInFrames={Math.round(props.totalDurationSec * FPS)}
    fps={FPS}
    width={1920}
    height={1080}
    defaultProps={props}
  />
);
```

```tsx
// Video.tsx — 세그먼트 = Sequence, 길이는 manifest duration
import { AbsoluteFill, Sequence } from "remotion";
import { SegmentScene } from "./components/SegmentScene";

export const Video = ({ segments, fps }) => {
  let from = 0;
  return (
    <AbsoluteFill>
      {segments.map((seg) => {
        const dur = Math.round(seg.durationSec * fps);
        const node = (
          <Sequence key={seg.index} from={from} durationInFrames={dur}>
            <SegmentScene seg={seg} />     {/* 오디오+B-roll+자막+모션 */}
          </Sequence>
        );
        from += dur;
        return node;
      })}
    </AbsoluteFill>
  );
};
```

`SegmentScene`은 `<Audio src={staticFile('audio/' + seg.file)} />` + `<BRoll>` + `<Captions>` + `<Emphasis>`를 합성한다(위 매핑 4레이어). 강조는 `spring`/`interpolate`로 `transform`·`opacity`만 건드린다.

### 렌더 명령 (포팅 후)

```bash
cd drafts/<project>/render/remotion
npm install
npx remotion render SubtractTube ../final.mp4 --codec=h264
# 미리보기 스튜디오: npx remotion studio
```

> 포팅 원칙: 오픈소스의 "씬 컴포넌트 + 데이터 주입 + CLI 렌더" 골격은 그대로 차용하되, **입력 계약은 우리 manifest/세그먼트로 1:1 치환**한다. 신규 창작이 아니라 검증된 구조의 입력 어댑터 교체다(파이프라인 전체의 차용·치환 철학과 동일).

---

## 출력 계약 (Output Contract)

```
drafts/<project>/render/
├── final.mp4              # 최종 영상 (1080p/30fps 기본)
├── remotion/             # 재현 가능한 Remotion 프로젝트(소스 포함)
└── assets/               # 생성/제공 B-roll·이미지
```

규칙:
- `final.mp4` 길이 ≈ manifest `total_duration_sec`(±1초). 어긋나면 타임라인 오프셋 버그.
- 세그먼트 ↔ 시퀀스 ↔ 오디오가 **1:1**, 순서·오프셋 누적이 정확(빈 구간·겹침 0).
- Remotion 프로젝트를 함께 남겨 **재렌더·수정 가능**(자막 오타·B-roll 교체 후 재렌더).

---

## 품질 게이트 (Quality Gates)

- [ ] **세그먼트 정합**: manifest 세그먼트 수 == 렌더된 `<Sequence>` 수. 누락·중복 0.
- [ ] **오디오 싱크**: 각 세그먼트 자막·B-roll이 해당 `seg-NN.mp3` 구간에 정렬됐는가? 오디오 끊김·겹침 없음.
- [ ] **길이 일치**: `final.mp4` 길이 ≈ manifest 총 길이(±1초).
- [ ] **자막 가독성**: 키워드 강조가 보이고, 안전영역 안, 외곽선/대비로 읽힘(채널 시니어 타겟이면 글자 크게).
- [ ] **모션 규율**: 애니메이션이 `transform`/`opacity`/`clip-path`만 사용(레이아웃 속성 금지). 도입부 강조가 가장 셈.
- [ ] **B-roll 채움**: 무지 배경+자막만인 세그먼트가 과도하지 않은가?(폴백 최소화)
- [ ] **출력 무결**: `final.mp4`가 `ffprobe`로 디코딩되고 영상·오디오 트랙 둘 다 존재.

---

## 사용자 준비 / 연동 (Setup)

- **Node 환경**: Node 18+ 와 npm. (`node -v`로 확인.)
- **Remotion 설치**: 첫 실행 시 `drafts/<project>/render/remotion`에서 `npm install`. Remotion은 내부적으로 Chromium 헤드리스로 렌더하므로 첫 설치 시 브라우저 다운로드가 일어날 수 있다.
- **ffmpeg**: Remotion이 인코딩에 사용(보통 자동 번들, 시스템 `ffmpeg` 있으면 더 안정).
- **Higgs(B-roll)**: 추가 키 불필요(MCP 연결됨). B-roll/이미지를 직접 제공하면 `assets/`에 넣고 화면큐 지시만 맞추면 됨.
- **BGM/폰트**: BGM 파일과 채널 폰트는 직접 제공(라이선스 확인). 없으면 BGM 생략하고 시스템/웹폰트 폴백.
- **참고 오픈소스**: 사용자 북마크 "클로드 코드 + Remotion 100% 자동 롱폼" 레포 URL이 확보되면, 그 씬 컴포넌트를 위 구조로 포팅(현재 URL 미확보 — `knowledge/biz-pt-longform-blueprint.md` §3 비고의 케이스. URL 공유 시 정확 포팅 가능).

---

> 이 스킬은 "화면 합성 + mp4 렌더"만 책임진다. 원고는 `yt-script`, 음성은 `yt-voiceover`가 만든다. 모든 산출물은 세그먼트 1:1 정합·오디오 싱크·편집 코어 순서·재현 가능한 Remotion 프로젝트 계약을 지킨다.
