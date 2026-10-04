import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT = {
  weights: { fit: 0.35, performance: 0.25, contribution: 0.2, views: 0.2 },
  grade_map: { worst: 0, bad: 25, normal: 50, good: 75, great: 100 },
};

export function loadScoring() {
  const p = resolve(__dirname, "../config/scoring.json");
  if (existsSync(p)) return { ...DEFAULT, ...JSON.parse(readFileSync(p, "utf8")) };
  return DEFAULT;
}

export function gradeToNum(g, map = DEFAULT.grade_map) {
  if (g == null) return null;
  return map[String(g).trim().toLowerCase()] ?? null;
}

/** 구독자 대비 조회수(노출 효율)를 0~100으로. ratio 0.1→0, 1→50, 10→100. */
export function viewsNorm(viewCount, subscriberCount) {
  const subs = Math.max(1, subscriberCount || 0);
  const ratio = Math.max(1e-6, (viewCount || 0) / subs);
  const score = ((Math.log10(ratio) + 1) / 2) * 100;
  return Math.round(Math.max(0, Math.min(100, score)));
}

/** 누락 축은 가중치에서 제외·재정규화하여 종합점수 산출 */
export function composite(c, scoring = loadScoring()) {
  const w = scoring.weights;
  const parts = [];
  const fit = c.scores?.fit ?? null;
  const perf = gradeToNum(c.performance, scoring.grade_map);
  const contrib = gradeToNum(c.contribution, scoring.grade_map);
  if (fit != null) parts.push([w.fit, fit]);
  if (perf != null) parts.push([w.performance, perf]);
  if (contrib != null) parts.push([w.contribution, contrib]);
  parts.push([w.views, viewsNorm(c.viewCount, c.subscriberCount)]);
  const wsum = parts.reduce((s, [wt]) => s + wt, 0) || 1;
  const score = parts.reduce((s, [wt, val]) => s + wt * val, 0) / wsum;
  return Math.round(score);
}

/** 제목+썸네일 아웃라이어 신호: 저구독·고조회일수록 높음(views/subs 로그 스케일 재사용) */
export function outlierScore(viewCount, subscriberCount) {
  return viewsNorm(viewCount, subscriberCount);
}

/** 카테고리(요소)마다 "좋은 요소"의 신호 가중치가 다르다 */
export const CATEGORY_WEIGHTS = {
  topic: { fit: 0.7, views: 0.3 },
  title_thumb: { outlier: 0.5, performance: 0.3, contribution: 0.2 },
  hook: { fit: 0.8, views: 0.2 },
  body: { performance: 0.45, fit: 0.3, contribution: 0.25 },
};

/** 카테고리별 종합 스코어. 누락 축은 제외·재정규화. */
export function categoryScore(category, c, scoring = loadScoring()) {
  const w = CATEGORY_WEIGHTS[category] || CATEGORY_WEIGHTS.topic;
  const map = {
    fit: c.scores?.fit ?? c.fit ?? null,
    performance: gradeToNum(c.performance ?? c.viewtrap?.perf, scoring.grade_map),
    contribution: gradeToNum(c.contribution ?? c.viewtrap?.contrib, scoring.grade_map),
    outlier: outlierScore(c.viewCount ?? c.views, c.subscriberCount ?? c.subs),
    views: viewsNorm(c.viewCount ?? c.views, c.subscriberCount ?? c.subs),
  };
  const parts = [];
  for (const [k, wt] of Object.entries(w)) if (map[k] != null) parts.push([wt, map[k]]);
  const wsum = parts.reduce((s, [wt]) => s + wt, 0) || 1;
  return Math.round(parts.reduce((s, [wt, v]) => s + wt * v, 0) / wsum);
}
