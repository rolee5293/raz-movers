import { describe, expect, it } from "vitest";
import { SRS_STEPS, gradeWord, migrateQuizGate } from "@/lib/storage";
import { mergeSaves } from "@/lib/merge";
import type { SaveState, WordProgress } from "@/types";

const LAST = SRS_STEPS.length - 1;
const atLastStep = (over: Partial<WordProgress> = {}): WordProgress => ({
  ivl: LAST, due: "2026-08-01", mastered: false, lapses: 0, learned: "2026-07-01", ...over,
});

describe("测验闸：掌握必须有客观证据", () => {
  it("一路点认得但从没在测验里答对过的词，不会被判为掌握", () => {
    let w = gradeWord(undefined, true, "2026-07-01");
    for (let i = 0; i < 20; i++) w = gradeWord(w, true, "2026-08-01");
    expect(w.mastered).toBe(false);
    expect(w.ivl).toBe(LAST); // 压在最后一步继续轮换，不是丢掉进度
  });

  it("在测验里答对过之后，下一次复习答对即掌握", () => {
    const w = gradeWord(atLastStep({ quizPassed: true }), true, "2026-08-01");
    expect(w.mastered).toBe(true);
  });

  it("旧存档的词一次性放行，不用新规矩追罚已经做完的功课", () => {
    const before = { quizGate: 0, words: { cat: atLastStep() } } as unknown as SaveState;
    const after = migrateQuizGate(before);
    expect(after.words.cat.quizPassed).toBe(true);
    expect(after.quizGate).toBe(1);
    // 幂等：再跑一次不会动已有数据
    expect(migrateQuizGate(after)).toBe(after);
  });

  it("过闸记录跨设备合并时取或——A 机测验答对，B 机不能把它抹掉", () => {
    const mk = (over: Partial<WordProgress>, xp: number): SaveState =>
      ({ version: 1, xpRate: 2, quizGate: 1, createdAt: "2026-07-01", xp, wordCursor: 0,
         words: { cat: atLastStep(over) }, daily: {}, badges: [],
         agents: { unlocked: [], current: "sage-01" }, stats: {} } as unknown as SaveState);
    const merged = mergeSaves([mk({ quizPassed: true }, 10), mk({ quizPassed: false, ivl: LAST - 1 }, 99)]);
    expect(merged.words.cat.quizPassed).toBe(true);
  });
});
