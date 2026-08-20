import { describe, expect, it } from "vitest";
import type { SaveState, WordProgress } from "@/types";
import {
  DAILY_NEW_WORDS,
  DAILY_REVIEW_CAP,
  SRS_STEPS,
  dueReviewWords,
  gradeWord,
  recountMastered,
} from "@/lib/storage";

const D0 = "2026-01-01";

function save(words: Record<string, WordProgress>): SaveState {
  return { words } as unknown as SaveState;
}
function wp(p: Partial<WordProgress>): WordProgress {
  return { ivl: 0, due: D0, mastered: false, lapses: 0, learned: D0, ...p };
}

describe("每日产能", () => {
  // 这条是本文件的重点：复习上限一旦低于稳态需求，到期队列就会发散，
  // SRS 间隔被静默拉长，"已掌握"永远涨不动。2026-08 就是这么坏掉的。
  it("复习上限必须覆盖稳态需求（每日新词 × SRS 步数），并留有清积压的余量", () => {
    const steadyState = DAILY_NEW_WORDS * SRS_STEPS.length;
    expect(DAILY_REVIEW_CAP).toBeGreaterThanOrEqual(steadyState);
    expect(DAILY_REVIEW_CAP).toBeGreaterThanOrEqual(Math.ceil(steadyState * 1.2));
  });
});

describe("gradeWord", () => {
  it("首次就认得的词直接进第二步，省掉一轮", () => {
    const p = gradeWord(undefined, true, D0);
    expect(p.ivl).toBe(1);
    expect(p.due).toBe("2026-01-03"); // +SRS_STEPS[1] = +2
    expect(p.lapses).toBe(0);
  });

  it("首次不认得的词从第一步开始，并记一次 lapse", () => {
    const p = gradeWord(undefined, false, D0);
    expect(p.ivl).toBe(0);
    expect(p.due).toBe("2026-01-02"); // +SRS_STEPS[0] = +1
    expect(p.lapses).toBe(1);
  });

  it("连续答对走完全部步数后才算掌握", () => {
    let p = gradeWord(undefined, false, D0); // ivl 0
    for (let i = 1; i < SRS_STEPS.length; i++) {
      p = gradeWord(p, true, D0);
      expect(p.mastered).toBe(false);
      expect(p.ivl).toBe(i);
    }
    p = gradeWord(p, true, D0);
    expect(p.mastered).toBe(true);
  });

  it("答错会掉回第一步重来", () => {
    let p = wp({ ivl: 3 });
    p = gradeWord(p, false, D0);
    expect(p.ivl).toBe(0);
    expect(p.mastered).toBe(false);
    expect(p.lapses).toBe(1);
  });
});

describe("dueReviewWords", () => {
  it("只取到期的、未掌握的词，按到期日升序，并受上限约束", () => {
    const s = save({
      late: wp({ due: "2026-01-01" }),
      early: wp({ due: "2025-12-30" }),
      future: wp({ due: "2026-02-01" }),
      done: wp({ due: "2025-12-01", mastered: true }),
    });
    expect(dueReviewWords(s, D0)).toEqual(["early", "late"]);
    expect(dueReviewWords(s, D0, 1)).toEqual(["early"]);
  });

  it("积压时优先清最早到期的，不会让老词饿死", () => {
    const words: Record<string, WordProgress> = {};
    for (let i = 0; i < 50; i++) words[`w${i}`] = wp({ due: `2026-01-${String(i % 28 + 1).padStart(2, "0")}` });
    const picked = dueReviewWords(save(words), "2026-01-28", 5);
    expect(picked).toHaveLength(5);
    expect(picked[0]).toBe("w0"); // 2026-01-01，最早
  });
});

describe("recountMastered", () => {
  it("只数 mastered 为真的词", () => {
    expect(recountMastered({ a: wp({ mastered: true }), b: wp({}), c: wp({ mastered: true }) })).toBe(2);
  });
});
