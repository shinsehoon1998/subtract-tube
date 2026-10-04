// 데이터 주도 모션 그래픽 씬 — 코드로 움직이는 인포그래픽(강화판).
// manifest 세그먼트의 motion:{type,data}를 SubtractVideo 안에서 렌더. 세그먼트는 <Sequence>라 frame은 0부터.
// 강화: 파티클 배경 · 승자 강조(왕관/글로우 펄스) · 카드 브리딩 · 비용 비례 막대 · 키네틱 타이틀 · 막대 성장.
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame } from "remotion";

const BLUE = "#22d3ee";
const RED = "#ef4444";
const WHITE = "#f4f7fb";
const DIM = "#63748f";
const FONT = '"Apple SD Gothic Neo","Noto Sans KR",system-ui,sans-serif';
const CL = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };
const spr = (f: number, d: number, damp = 15, stiff = 110) => spring({ frame: f - d, fps: 30, config: { damping: damp, stiffness: stiff } });
const fmt = (v: number, whole: boolean) => (whole ? Math.round(v).toString() : v.toFixed(1));
const breathe = (f: number, amp = 4, sp = 0.05, ph = 0) => Math.sin(f * sp + ph) * amp;

// 살아있는 배경 — 라디얼 글로우 + 드리프트 파티클
const AmbientBg = () => {
  const f = useCurrentFrame();
  const gx = 50 + Math.sin(f * 0.012) * 8;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(130% 100% at ${gx}% 20%, #10203a 0%, #05070d 60%)`, overflow: "hidden" }}>
      {Array.from({ length: 26 }).map((_, i) => {
        const seed = i * 137.5;
        const x = (Math.sin(seed) * 0.5 + 0.5) * 1920;
        const drift = f * (0.25 + (i % 3) * 0.15) * (i % 2 ? 1 : -1);
        const y = ((((Math.cos(seed * 1.3) * 0.5 + 0.5) * 1080 + drift) % 1080) + 1080) % 1080;
        const op = 0.06 + 0.1 * (Math.sin(f * 0.05 + i) * 0.5 + 0.5);
        const s = 4 + (i % 3) * 3;
        return <div key={i} style={{ position: "absolute", left: x, top: y, width: s, height: s, borderRadius: s, background: BLUE, opacity: op, boxShadow: `0 0 ${8 + s}px ${BLUE}` }} />;
      })}
    </AbsoluteFill>
  );
};

// 키네틱 타이틀 — 스프링 등장 + 미세 플로트
const KTitle = ({ text, color = WHITE }: any) => {
  const f = useCurrentFrame();
  const e = spr(f, 2, 14, 120);
  return (
    <div style={{ position: "absolute", top: 108, width: "100%", textAlign: "center", fontSize: 72, fontWeight: 900, color, opacity: Math.min(1, e), transform: `translateY(${interpolate(e, [0, 1], [-40, 0]) + breathe(f, 3, 0.04)}px)`, textShadow: color === BLUE ? `0 0 32px ${BLUE}66` : "none" }}>{text}</div>
  );
};

const Num = ({ prefix = "", num, suffix = "", start, accent }: any) => {
  const f = useCurrentFrame();
  const p = spr(f, start, 13, 90);
  const v = interpolate(p, [0, 1], [0, num], CL);
  return <span style={{ fontSize: 54, fontWeight: 800, color: accent ? BLUE : WHITE }}>{prefix}{fmt(v, Number.isInteger(num))}{suffix}</span>;
};

const costOf = (c: any) => { const r = (c.rows || []).find((r: any) => r.label === "비용"); return r ? r.num : 0; };

const Card = ({ card, x, delay, accent, costMax }: any) => {
  const f = useCurrentFrame();
  const e = spr(f, delay);
  const win = !!card.check;
  const glow = win || accent ? 18 + Math.sin(f * 0.08) * 10 : 0;
  const myCost = costOf(card);
  const barW = costMax > 0 ? (myCost / costMax) * 100 : 0;
  const barGrow = spr(f, 40, 16, 90);
  return (
    <div style={{
      position: "absolute", top: 176, left: x, width: 640, boxSizing: "border-box",
      transform: `translateY(${interpolate(e, [0, 1], [70, 0]) + breathe(f, 3, 0.045, x)}px)`, opacity: Math.min(1, e),
      background: "rgba(9,14,24,0.66)", border: `3px solid ${accent ? BLUE : win ? "#3a5b6e" : "#2a3a55"}`,
      borderRadius: 30, padding: "30px 42px", boxShadow: glow ? `0 0 ${40 + glow * 2}px ${BLUE}${accent ? "55" : "3a"}` : "none",
    }}>
      {win && <div style={{ position: "absolute", top: -32, left: 0, right: 0, textAlign: "center", transform: `scale(${Math.min(1, spr(f, 60, 9, 150))}) translateY(${breathe(f, 4, 0.09)}px)` }}><span style={{ display: "inline-block", fontSize: 34, fontWeight: 900, color: "#0a0a0a", background: "#ffd166", padding: "6px 26px", borderRadius: 20, boxShadow: `0 0 26px #ffd16688` }}>이 판 승</span></div>}
      <div style={{ fontSize: 82, fontWeight: 900, color: accent ? BLUE : WHITE, textAlign: "center", marginBottom: 12, textShadow: accent ? `0 0 34px ${BLUE}88` : "none" }}>{card.name}</div>
      {(card.rows || []).map((r: any, i: number) => {
        const st = 14 + i * 8;
        const op = interpolate(f, [st, st + 10], [0, 1], CL);
        return (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", opacity: op, padding: "12px 0", borderBottom: `1px solid ${accent ? "#1f3a4a" : "#1c2740"}` }}>
            <span style={{ fontSize: 44, color: DIM }}>{r.label}</span>
            <Num prefix={r.prefix} num={r.num} suffix={r.suffix} start={st} accent={accent} />
          </div>
        );
      })}
      {costMax > 0 && myCost > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 26, color: DIM, marginBottom: 6, letterSpacing: "0.1em" }}>비용 비교</div>
          <div style={{ height: 26, background: "#141d2e", borderRadius: 13, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${barW * Math.min(1, barGrow)}%`, background: accent ? BLUE : "#4a5c78", borderRadius: 13, boxShadow: accent ? `0 0 24px ${BLUE}88` : "none" }} />
          </div>
        </div>
      )}
      {card.badge && (() => { const b = spr(f, 72, 9, 150); const pulse = 1 + Math.sin(f * 0.12) * 0.03; return (
        <div style={{ textAlign: "center", marginTop: 22, opacity: Math.min(1, b), transform: `scale(${interpolate(b, [0, 1], [0.4, 1]) * pulse})` }}>
          <span style={{ display: "inline-block", fontSize: 50, fontWeight: 900, color: "#03121a", background: BLUE, padding: "10px 30px", borderRadius: 16, boxShadow: `0 0 ${40 + Math.sin(f * 0.12) * 18}px ${BLUE}` }}>{card.badge}</span>
        </div>); })()}
    </div>
  );
};
const Scoreboard = ({ data }: any) => {
  const costMax = Math.max(costOf(data.left), costOf(data.right));
  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <AmbientBg />
      <Card card={data.left} x={250} delay={4} costMax={costMax} />
      <Card card={data.right} x={1030} delay={12} accent costMax={costMax} />
    </AbsoluteFill>
  );
};

// 막대 그래프 — 성장 + 상단 시머
const Bars = ({ data }: any) => {
  const f = useCurrentFrame();
  const max = Math.max(...data.bars.map((b: any) => b.num));
  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <AmbientBg />
      <KTitle text={data.title} />
      <div style={{ position: "absolute", bottom: 150, left: 0, right: 0, display: "flex", justifyContent: "center", alignItems: "flex-end", gap: 88, height: 560 }}>
        {data.bars.map((b: any, i: number) => {
          const g = spr(f, 12 + i * 10, 16, 90);
          const h = interpolate(g, [0, 1], [0, (b.num / max) * 500], CL);
          const shimmer = b.accent ? 0.85 + Math.sin(f * 0.1) * 0.15 : 1;
          return (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
              <span style={{ fontSize: 48, fontWeight: 800, color: b.accent ? BLUE : DIM, transform: `translateY(${b.accent ? breathe(f, 4, 0.08) : 0}px)` }}>{b.label}</span>
              <div style={{ width: 150, height: h, borderRadius: 14, background: b.accent ? BLUE : "#3a4a63", opacity: shimmer, boxShadow: b.accent ? `0 0 ${34 + Math.sin(f * 0.1) * 16}px ${BLUE}88` : "none" }} />
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// 탤리 — 카운트업 대결 + 승자 글로우 펄스
const Tally = ({ data }: any) => {
  const f = useCurrentFrame();
  const side = (s: any, x: number, accent: boolean) => {
    const v = interpolate(spr(f, 16, 14, 80), [0, 1], [0, s.count], CL);
    const gl = accent ? 40 + Math.sin(f * 0.1) * 20 : 0;
    return (
      <div style={{ position: "absolute", top: 300, left: x, textAlign: "center", transform: `translateY(${accent ? breathe(f, 6, 0.06) : 0}px)` }}>
        <div style={{ fontSize: 72, fontWeight: 900, color: accent ? BLUE : DIM }}>{s.name}</div>
        <div style={{ fontSize: 320, fontWeight: 900, color: accent ? BLUE : WHITE, textShadow: gl ? `0 0 ${gl}px ${BLUE}` : "none", lineHeight: 1 }}>{Math.round(v)}</div>
      </div>
    );
  };
  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <AmbientBg />
      <KTitle text={data.title} />
      {side(data.a, 360, true)}
      <div style={{ position: "absolute", top: 430, width: "100%", textAlign: "center", fontSize: 120, fontWeight: 900, color: DIM, opacity: 0.5 + Math.sin(f * 0.15) * 0.3 }}>:</div>
      {side(data.b, 1160, false)}
      {data.note && <div style={{ position: "absolute", bottom: 128, width: "100%", textAlign: "center", fontSize: 46, fontWeight: 700, color: RED, opacity: interpolate(f, [66, 80], [0, 1], CL) }}>{data.note}</div>}
    </AbsoluteFill>
  );
};

// 체크리스트 — 순차 등장 + 체크 팝 + 글로우
const Checklist = ({ data }: any) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ fontFamily: FONT, justifyContent: "center", paddingLeft: 280 }}>
      <AmbientBg />
      <div style={{ opacity: Math.min(1, spr(f, 0)), transform: `translateY(${interpolate(spr(f, 0), [0, 1], [-30, 0])}px)`, fontSize: 72, fontWeight: 900, color: BLUE, marginBottom: 62, textShadow: `0 0 ${28 + Math.sin(f * 0.08) * 12}px ${BLUE}66` }}>{data.title}</div>
      {(data.items || []).map((text: string, i: number) => {
        const d = 16 + i * 18;
        const e = spr(f, d);
        const ck = spr(f, d + 9, 10, 170);
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 34, opacity: Math.min(1, e), transform: `translateX(${interpolate(e, [0, 1], [-50, 0])}px)`, marginBottom: 42 }}>
            <div style={{ width: 84, height: 84, borderRadius: 20, border: `5px solid ${BLUE}`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 ${24 + Math.sin(f * 0.1 + i) * 10}px ${BLUE}55` }}>
              <span style={{ fontSize: 62, color: BLUE, fontWeight: 900, transform: `scale(${Math.min(1, ck)})` }}>✓</span>
            </div>
            <span style={{ fontSize: 72, fontWeight: 800, color: WHITE }}>{text}</span>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// 결과 목업 비교 — 브라우저 창 재현 이미지 2장 좌우 + "재현 이미지" 배지 (완성도 승자는 파랑 글로우)
const MockCompare = ({ data }: any) => {
  const f = useCurrentFrame();
  const capE = spr(f, 0, 14, 120);
  const side = (s: any, x: number, delay: number, dir: number) => {
    const e = spr(f, delay);
    const glow = s.glow ? 26 + Math.sin(f * 0.08) * 12 : 0;
    return (
      <div style={{ position: "absolute", top: 226, left: x, width: 850, opacity: Math.min(1, e), transform: `translateX(${interpolate(e, [0, 1], [dir * 80, 0], CL)}px) translateY(${breathe(f, 3, 0.045, x)}px)` }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 18, marginBottom: 18, justifyContent: "center" }}>
          <span style={{ fontSize: 62, fontWeight: 900, color: s.glow ? BLUE : WHITE, textShadow: s.glow ? `0 0 30px ${BLUE}88` : "none" }}>{s.label}</span>
          <span style={{ fontSize: 30, fontWeight: 700, color: DIM }}>{s.sub}</span>
        </div>
        <div style={{ width: 850, height: 474, borderRadius: 20, overflow: "hidden", border: `3px solid ${s.glow ? BLUE : "#2a3a55"}`, boxShadow: glow ? `0 0 ${44 + glow * 2}px ${BLUE}55` : "0 22px 60px rgba(0,0,0,0.55)", background: "#05070d" }}>
          <Img src={staticFile(`gfx/${s.img}`)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
      </div>
    );
  };
  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <AmbientBg />
      <div style={{ position: "absolute", top: 92, width: "100%", display: "flex", justifyContent: "center", alignItems: "center", gap: 24, opacity: Math.min(1, capE), transform: `translateY(${interpolate(capE, [0, 1], [-30, 0], CL)}px)` }}>
        <span style={{ fontSize: 56, fontWeight: 900, color: WHITE }}>{data.caption}</span>
        <span style={{ fontSize: 26, fontWeight: 800, color: "#03121a", background: BLUE, padding: "7px 20px", borderRadius: 999, letterSpacing: "0.06em", boxShadow: `0 0 26px ${BLUE}66` }}>재현 이미지</span>
      </div>
      {side(data.left, 90, 6, -1)}
      {side(data.right, 980, 12, 1)}
    </AbsoluteFill>
  );
};

// 단일 재현 목업 — 풀블리드 UI 스크린샷 + 상단 캡션/"재현 이미지" 배지 + 느린 줌
const MockSingle = ({ data }: any) => {
  const f = useCurrentFrame();
  const e = spr(f, 2, 14, 120);
  const zoom = 1 + Math.min(f, 300) * 0.0004;
  return (
    <AbsoluteFill style={{ fontFamily: FONT, background: "#05070d" }}>
      <AbsoluteFill style={{ opacity: Math.min(1, e) }}>
        <Img src={staticFile(`gfx/${data.img}`)} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${zoom})`, transformOrigin: "center 40%" }} />
      </AbsoluteFill>
      <div style={{ position: "absolute", top: 40, width: "100%", display: "flex", justifyContent: "center", gap: 20, alignItems: "center", opacity: Math.min(1, e), transform: `translateY(${interpolate(e, [0, 1], [-24, 0], CL)}px)` }}>
        <span style={{ fontSize: 44, fontWeight: 900, color: WHITE, textShadow: "0 2px 18px rgba(0,0,0,.85)" }}>{data.caption}</span>
        <span style={{ fontSize: 24, fontWeight: 800, color: "#03121a", background: BLUE, padding: "6px 18px", borderRadius: 999, boxShadow: `0 0 24px ${BLUE}66` }}>재현 이미지</span>
      </div>
    </AbsoluteFill>
  );
};

// 수치 모핑 — 큰 숫자가 from→to로 카운트업 + 강조 글로우. 영상의 감정 비트(에반: 21%→95%).
const StatCount = ({ data }: any) => {
  const f = useCurrentFrame();
  const from = data.from ?? 0;
  const p = spr(f, 8, 16, 70);
  const v = interpolate(p, [0, 1], [from, data.to], CL);
  const whole = Number.isInteger(data.to) && Number.isInteger(from);
  const gl = 44 + Math.sin(f * 0.1) * 22;
  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <AmbientBg />
      {data.title && <KTitle text={data.title} />}
      <div style={{ position: "absolute", top: 372, width: "100%", textAlign: "center" }}>
        <div style={{ fontSize: 300, fontWeight: 900, color: BLUE, lineHeight: 1, textShadow: `0 0 ${gl}px ${BLUE}`, transform: `translateY(${breathe(f, 6, 0.06)}px)` }}>
          {data.prefix || ""}{fmt(v, whole)}{data.suffix || ""}
        </div>
        {data.caption && <div style={{ fontSize: 58, fontWeight: 800, color: WHITE, marginTop: 26, opacity: interpolate(f, [22, 36], [0, 1], CL) }}>{data.caption}</div>}
      </div>
    </AbsoluteFill>
  );
};

// 섹션 스파인 — "N가지 중 지금 여기". 완료=체크+딤, 현재=파랑 글로우. 긴 영상 이탈 방지(에반: 4층 건물 재등장).
const SectionSpine = ({ data }: any) => {
  const f = useCurrentFrame();
  const items = data.items || [];
  const active = data.active ?? 0;
  return (
    <AbsoluteFill style={{ fontFamily: FONT, justifyContent: "center", paddingLeft: 240 }}>
      <AmbientBg />
      {data.title && <div style={{ opacity: Math.min(1, spr(f, 0)), transform: `translateY(${interpolate(spr(f, 0), [0, 1], [-30, 0])}px)`, fontSize: 64, fontWeight: 900, color: BLUE, marginBottom: 54, textShadow: `0 0 26px ${BLUE}55` }}>{data.title}</div>}
      {items.map((it: string, i: number) => {
        const e = spr(f, 10 + i * 6);
        const isActive = i === active;
        const done = i < active;
        const glow = isActive ? 26 + Math.sin(f * 0.1) * 12 : 0;
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 32, marginBottom: 34, opacity: Math.min(1, e) * (done ? 0.5 : 1), transform: `translateX(${interpolate(e, [0, 1], [-44, 0])}px) scale(${isActive ? 1.06 : 1})`, transformOrigin: "left center" }}>
            <div style={{ width: 74, height: 74, borderRadius: 999, border: `5px solid ${isActive || done ? BLUE : DIM}`, display: "flex", alignItems: "center", justifyContent: "center", background: isActive ? BLUE : "transparent", color: isActive ? "#03121a" : BLUE, fontSize: 42, fontWeight: 900, boxShadow: glow ? `0 0 ${glow}px ${BLUE}` : "none" }}>{done ? "✓" : i + 1}</div>
            <span style={{ fontSize: 62, fontWeight: isActive ? 900 : 700, color: isActive ? WHITE : done ? DIM : "#9fb0c8", textShadow: isActive ? `0 0 24px ${BLUE}55` : "none" }}>{it}</span>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// 비유 앵커 — 추상 개념 = 물리 비유. 이모지 아이콘으로 즉시 이해(에반 시그니처: 토큰=열쇠, 데이터=영수증).
const AnalogyCard = ({ data }: any) => {
  const f = useCurrentFrame();
  const le = spr(f, 4, 14, 110);
  const re = spr(f, 16, 14, 110);
  const eq = spr(f, 26, 12, 140);
  const box = (label: string, icon: string, e: number, accent: boolean, x: number) => (
    <div style={{ position: "absolute", top: 316, left: x, width: 600, textAlign: "center", opacity: Math.min(1, e), transform: `translateY(${interpolate(e, [0, 1], [60, 0], CL) + breathe(f, 3, 0.045, x)}px)` }}>
      <div style={{ fontSize: 200, lineHeight: 1, filter: accent ? `drop-shadow(0 0 34px ${BLUE}99)` : "none" }}>{icon}</div>
      <div style={{ fontSize: 58, fontWeight: 900, color: accent ? BLUE : WHITE, marginTop: 22, textShadow: accent ? `0 0 26px ${BLUE}66` : "none" }}>{label}</div>
    </div>
  );
  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <AmbientBg />
      {data.title && <KTitle text={data.title} />}
      {box(data.concept, data.conceptIcon || "🧩", le, false, 120)}
      <div style={{ position: "absolute", top: 438, width: "100%", textAlign: "center", fontSize: 128, fontWeight: 900, color: BLUE, opacity: Math.min(1, eq), transform: `scale(${interpolate(eq, [0, 1], [0.3, 1], CL)})`, textShadow: `0 0 30px ${BLUE}66` }}>=</div>
      {box(data.analogy, data.analogyIcon || "🔑", re, true, 1200)}
      {data.note && <div style={{ position: "absolute", top: 632, width: "100%", textAlign: "center", fontSize: 40, fontWeight: 700, color: DIM, opacity: interpolate(f, [40, 54], [0, 1], CL) }}>{data.note}</div>}
    </AbsoluteFill>
  );
};

const MOTION: Record<string, any> = { scoreboard: Scoreboard, bars: Bars, tally: Tally, checklist: Checklist, mockcompare: MockCompare, mocksingle: MockSingle, statCount: StatCount, sectionSpine: SectionSpine, analogyCard: AnalogyCard };

export const MotionScene = ({ type, data }: { type: string; data: any }) => {
  const Comp = MOTION[type];
  if (!Comp) return null;
  return <Comp data={data} />;
};
