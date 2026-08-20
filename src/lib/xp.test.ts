import { describe, expect, it } from "vitest";
import { XP, SRS_STEPS, DAILY_NEW_WORDS, DAILY_REVIEW_CAP } from "@/lib/storage";

describe("XP 激励结构", () => {
  // 2026-08 之前复习是 2 XP/张，测验一题 10 XP 且可无限加练——
  // 唯一能推动"已掌握"的动作单价最低，孩子理性地去刷测验，掌握数永远不动。
  it("复习单价必须高于测验每题分，否则刷测验永远比复习划算", () => {
    expect(XP.reviewPerKnown).toBeGreaterThan(XP.wordPerKnown);
    expect(XP.reviewPerKnown * DAILY_REVIEW_CAP).toBeGreaterThan(XP.quizPerCorrect * 10 + XP.quizPerfect);
  });

  it("一天的复习收益应超过刷两轮满分测验，让复习成为最优解", () => {
    const steadyReviews = DAILY_NEW_WORDS * SRS_STEPS.length;
    const reviewXp = steadyReviews * XP.reviewPerKnown + XP.wordBase + XP.reviewClearBonus;
    const twoPerfectQuizzes = 2 * (XP.quizPerCorrect * 10 + XP.quizPerfect);
    expect(reviewXp).toBeGreaterThan(twoPerfectQuizzes);
  });

  it("掌握一个词有独立奖励——为结果付钱，不只为动作付钱", () => {
    expect(XP.masteredBonus).toBeGreaterThan(0);
  });
});
