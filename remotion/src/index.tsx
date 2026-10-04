import {
  AbsoluteFill,
  Audio,
  Composition,
  Img,
  Sequence,
  interpolate,
  registerRoot,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import manifest from "./manifest.json";

/**
 * yt-render 컴포지션 — yt-voiceover manifest(세그먼트 음성+실측 길이) +
 * yt-script 화면큐(caption_keywords)를 주입받아 데이터 주도로 그린다.
 * 세그먼트 1개 = <Sequence> 1개, 길이 = 실측 음성 길이.
 * 모션은 compositor 친화 속성(transform/opacity)만 사용한다.
 */

import { MotionScene } from "./motion";

type Cue = { text: string; start: number; end: number };
type Segment = {
  index: number;
  file: string;
  broll?: string;
  duration_sec: number;
  narration_normalized: string;
  caption_keywords: string[];
  subtitles?: Cue[];
  motion?: { type: string; data: unknown };
  speed: number;
  tone: string;
};

type RenderStyle = {
  bg?: string;
  bgGlow?: string;
  text?: string;
  accent?: string;
  bgImage?: string | null;
  motionPreset?: "calm" | "dynamic";
  brandLabel?: string;
};
type Manifest = {
  project: string;
  fps: number;
  total_duration_sec: number;
  voice_name: string;
  bgm?: string;
  style?: RenderStyle;
  segments: Segment[];
};

const DATA = manifest as Manifest;
const FPS = DATA.fps ?? 30;
const STYLE: RenderStyle = DATA.style ?? {};
const MOTION = STYLE.motionPreset === "dynamic" ? 1.6 : 1; // 연출 프리셋 → 모션 강도

// 디자인 토큰 — 다크 에디토리얼
const COLOR = {
  bg: STYLE.bg ?? "#0a0b0f",
  bgGlow: STYLE.bgGlow ?? "#1b2330",
  text: STYLE.text ?? "#f4f5f7",
  textDim: "rgba(244,245,247,0.34)",
  accent: STYLE.accent ?? "#5b9dff",
  accentSoft: "rgba(91,157,255,0.16)",
  hairline: "rgba(255,255,255,0.10)",
};

const FONT = '"Pretendard", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';

// 배경음 게인 ≈ -3.7dB → 믹스 내 BGM ~-31 LUFS (나레이션 -21 LUFS 대비 ~10 LU 아래)
// 소스 BGM이 -26.9 LUFS로 원래 조용해 0.11(-19dB)에선 ~-46 LUFS로 묻혔음 → 0.65로 상향
const BGM_GAIN = 0.65;
const BGM_FADE_IN = 30;
const BGM_FADE_OUT = 45;

const framesOf = (sec: number) => Math.round(sec * FPS);
const TOTAL_FRAMES = Math.max(
  FPS,
  DATA.segments.reduce((n, s) => n + framesOf(s.duration_sec), 0),
);

type SegmentSceneProps = {
  seg: Segment;
  order: number;
};

function SegmentScene({ seg, order }: SegmentSceneProps) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // 세그먼트 진입 모션 (opacity + translateY) — 레이아웃 속성 금지
  const enter = spring({ frame, fps: FPS, config: { damping: 200, mass: 0.6 } });
  const enterY = interpolate(enter, [0, 1], [44, 0]);

  // Ken Burns — 배경 글로우 완만한 scale (정적 화면에 생동감)
  const bgScale = interpolate(frame, [0, durationInFrames], [1.04, 1.14], {
    extrapolateRight: "clamp",
  });

  // B-roll Ken Burns — scale + 좌우 팬(세그먼트마다 방향 교대), 진입 페이드
  const imgScale = interpolate(frame, [0, durationInFrames], [1.08, 1.2], {
    extrapolateRight: "clamp",
  });
  const panDir = order % 2 === 0 ? -1 : 1;
  const panX = interpolate(
    frame,
    [0, durationInFrames],
    [panDir * -2.4, panDir * 2.4],
    { extrapolateRight: "clamp" },
  );
  const brollIn = interpolate(frame, [0, 10], [0, 1], {
    extrapolateRight: "clamp",
  });

  // 키워드 타이밍 — 세그먼트 길이를 키워드 수로 균등 분배(워드 타이밍 폴백)
  const keywords = seg.caption_keywords;
  const slot = durationInFrames / Math.max(1, keywords.length);
  const activeIdx = Math.min(keywords.length - 1, Math.floor(frame / slot));

  return (
    <AbsoluteFill style={{ backgroundColor: COLOR.bg }}>
      {/* 데이터 씬 = 코드 모션 그래픽 / 서사·은유 씬 = Higgs 정적 이미지 (하이브리드) */}
      {seg.motion ? (
        <>
          <AbsoluteFill style={{ opacity: brollIn }}>
            <MotionScene type={seg.motion.type} data={seg.motion.data} />
          </AbsoluteFill>
          <AbsoluteFill
            style={{
              background:
                "linear-gradient(180deg, rgba(5,7,13,0.5) 0%, rgba(5,7,13,0) 18%, rgba(5,7,13,0) 74%, rgba(5,7,13,0.72) 100%)",
            }}
          />
        </>
      ) : seg.broll ? (
        <>
          <AbsoluteFill style={{ opacity: brollIn }}>
            <Img
              src={staticFile(`assets/${seg.broll}`)}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                transform: `scale(${imgScale}) translateX(${panX}%)`,
                transformOrigin: "center",
              }}
            />
          </AbsoluteFill>
          {/* 좌측 다크 스크림 — 자막 가독성 */}
          <AbsoluteFill
            style={{
              background:
                "linear-gradient(90deg, rgba(10,11,15,0.94) 0%, rgba(10,11,15,0.78) 34%, rgba(10,11,15,0.42) 64%, rgba(10,11,15,0.14) 100%)",
            }}
          />
          {/* 상·하단 보호 그라데이션 — 브랜드/프로그레스 가독성 */}
          <AbsoluteFill
            style={{
              background:
                "linear-gradient(180deg, rgba(10,11,15,0.6) 0%, rgba(10,11,15,0) 20%, rgba(10,11,15,0) 76%, rgba(10,11,15,0.66) 100%)",
            }}
          />
        </>
      ) : STYLE.bgImage ? (
        <AbsoluteFill style={{ transform: `scale(${bgScale})` }}>
          <Img src={staticFile(STYLE.bgImage)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <AbsoluteFill style={{ background: `linear-gradient(90deg, ${COLOR.bg}f0 0%, ${COLOR.bg}c0 44%, ${COLOR.bg}55 100%)` }} />
        </AbsoluteFill>
      ) : (
        <AbsoluteFill
          style={{
            transform: `scale(${bgScale})`,
            background: `radial-gradient(120% 90% at 18% 0%, ${COLOR.bgGlow} 0%, ${COLOR.bg} 58%)`,
          }}
        />
      )}

      {/* STEP 라벨 — 우상단 소형. GFX가 메시지를 담당하므로 좌측 대형 키워드 스택은 제거(겹침 해소). */}
      <div
        style={{
          position: "absolute",
          top: 52,
          right: 96,
          fontFamily: FONT,
          fontSize: 26,
          fontWeight: 600,
          letterSpacing: "0.22em",
          color: COLOR.accent,
          opacity: enter,
        }}
      >
        STEP {String(order).padStart(2, "0")} — {seg.tone.toUpperCase()}
      </div>

      {/* 하단 싱크 자막 — ElevenLabs 문자 타임스탬프 기반, 말과 정확히 동기(시니어 가독성) */}
      {(() => {
        const t = frame / FPS;
        const sub = (seg.subtitles || []).find((c) => t >= c.start && t < c.end);
        if (!sub) return null;
        return (
          <div
            style={{
              position: "absolute",
              bottom: 128,
              left: 0,
              right: 0,
              display: "flex",
              justifyContent: "center",
              padding: "0 160px",
            }}
          >
            <div
              style={{
                fontFamily: FONT,
                fontSize: 48,
                fontWeight: 700,
                lineHeight: 1.34,
                color: "#fff",
                textAlign: "center",
                whiteSpace: "pre-line",
                wordBreak: "keep-all",
                background: "rgba(10,11,15,0.74)",
                padding: "16px 32px",
                borderRadius: 16,
                maxWidth: "82%",
              }}
            >
              {sub.text}
            </div>
          </div>
        );
      })()}

      {/* 세그먼트 음성 (길이의 기준) */}
      <Audio src={staticFile(`audio/${seg.file}`)} />
    </AbsoluteFill>
  );
}

function Brand() {
  return (
    <div
      style={{
        position: "absolute",
        top: 72,
        left: 200,
        display: "flex",
        alignItems: "center",
        gap: 16,
        fontFamily: FONT,
      }}
    >
      <div
        style={{
          width: 14,
          height: 14,
          borderRadius: 4,
          backgroundColor: COLOR.accent,
        }}
      />
      <span style={{ fontSize: 26, fontWeight: 700, color: COLOR.text }}>
        {STYLE.brandLabel ?? "빼기연구소 · EP01"}
      </span>
    </div>
  );
}

function ProgressBar() {
  const frame = useCurrentFrame();
  const pct = interpolate(frame, [0, TOTAL_FRAMES], [0, 100], {
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        position: "absolute",
        left: 200,
        right: 200,
        bottom: 84,
      }}
    >
      <div
        style={{
          height: 4,
          borderRadius: 999,
          backgroundColor: COLOR.hairline,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            backgroundColor: COLOR.accent,
          }}
        />
      </div>
    </div>
  );
}

function SubtractVideo() {
  let from = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: COLOR.bg }}>
      {DATA.segments.map((seg, i) => {
        const dur = framesOf(seg.duration_sec);
        const node = (
          <Sequence key={seg.index} from={from} durationInFrames={dur}>
            <SegmentScene seg={seg} order={i + 1} />
          </Sequence>
        );
        from += dur;
        return node;
      })}
      {/* 전역 배경음 (BGM) — 나레이션 더킹 + 페이드 인/아웃 */}
      {DATA.bgm ? (
        <Audio
          src={staticFile(`audio/${DATA.bgm}`)}
          volume={(f) =>
            interpolate(
              f,
              [0, BGM_FADE_IN, TOTAL_FRAMES - BGM_FADE_OUT, TOTAL_FRAMES],
              [0, BGM_GAIN, BGM_GAIN, 0],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            )
          }
        />
      ) : null}
      <Brand />
      <ProgressBar />
    </AbsoluteFill>
  );
}

function Root() {
  return (
    <Composition
      id="SubtractVideo"
      component={SubtractVideo}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={1920}
      height={1080}
    />
  );
}

registerRoot(Root);
