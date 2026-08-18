/**
 * 巅峰层落点。数据取自 2026-08-18 云端真实存档，
 * 断言的是"上线当天弟弟停在哪一级"——逐级解锁一旦写错，
 * 补差会让人一口气连跳好几级，之后再无目标。
 */
import { describe, expect, it } from "vitest";
import { PEAKS, peakLevel, nextPeak } from "./game";
import type { SaveState } from "@/types";

const helpers = { streak: 6, maxStreak: 6 };

function save(over: Partial<SaveState> = {}): SaveState {
  return {
    version: 1, xpRate: 2, createdAt: "2026-07-23", xp: 45450, wordCursor: 0,
    words: {}, daily: {}, badges: [], agents: { unlocked: [], current: "sage-01" },
    stats: {
      masteredCount: 0, quizzesTaken: 0, quizQuestions: 0, quizCorrect: 0,
      perfectQuizzes: 93, readingsDone: 0, readingsPerfect: 11,
      bestCombo: 5, wordsLearned: 0, perfectDays: 18,
    },
    ...over,
  };
}

describe("巅峰层", () => {
  it("弟弟当前落在巅峰 2", () => {
    expect(peakLevel(save(), helpers)).toBe(2);
  });

  it("XP 再高也不能跳过没达成的挑战", () => {
    // XP 直接给满巅峰 10 的门槛，等级仍应停在同一级
    expect(peakLevel(save({ xp: 999999 }), helpers)).toBe(2);
  });

  it("下一级会给出具体缺口，而不是只报一个 XP 数字", () => {
    const n = nextPeak(save(), helpers);
    expect(n).not.toBeNull();
    expect(n!.def.level).toBe(2 + 1);
    expect(n!.need).toBeGreaterThan(0);
    expect(n!.def.challenge).toBeTruthy();
  });

  it("巅峰 1 的门槛就是段位满级线，满级当天即可入巅峰", () => {
    expect(PEAKS[0].minXp).toBe(31200);
  });
});
