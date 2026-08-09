/**
 * 多设备存档合并的回归测试。
 *
 * 这段逻辑直接决定孩子的学习进度会不会被吞掉：
 * 累计量若误写成相加会虚增，若误写成覆盖会丢进度，两种错误都不会报错、只会静默出现在界面上。
 */
import { describe, expect, it } from "vitest";
import { mergeSaves } from "./merge";
import type { DayRecord, SaveState } from "@/types";

const base = (over: Partial<SaveState> = {}): SaveState => ({
  version: 1,
  createdAt: "2026-07-23",
  xp: 0,
  wordCursor: 0,
  words: {},
  daily: {},
  badges: [],
  agents: { unlocked: [], current: "a" },
  stats: {
    masteredCount: 0,
    quizzesTaken: 0,
    quizQuestions: 0,
    quizCorrect: 0,
    perfectQuizzes: 0,
    readingsDone: 0,
    readingsPerfect: 0,
    bestCombo: 0,
    wordsLearned: 0,
    perfectDays: 0,
  },
  ...over,
});

const day = (over: Partial<DayRecord> = {}): DayRecord => ({
  date: "2026-08-08",
  xp: 0,
  newTask: { idxs: [1, 2], done: false, known: 0 },
  reviewTask: { words: ["a"], done: false, known: 0 },
  quizTask: { done: false, locked: false, score: 0, total: 0 },
  readingTask: { passageId: -1, done: false, correct: 0, total: 0 },
  bonusGiven: false,
  ...over,
});

describe("mergeSaves", () => {
  it("累计量取最大值而非相加，避免同一份进度被重复计入", () => {
    const a = base({ xp: 500, wordCursor: 110 });
    a.stats.quizQuestions = 650;
    a.stats.readingsDone = 457;
    const b = base({ xp: 300, wordCursor: 80 });
    b.stats.quizQuestions = 400;
    b.stats.readingsDone = 200;

    const m = mergeSaves([a, b])!;
    expect(m.xp).toBe(500);
    expect(m.wordCursor).toBe(110);
    expect(m.stats.quizQuestions).toBe(650);
    expect(m.stats.readingsDone).toBe(457);
  });

  it("保留两台设备各自学过的不同单词", () => {
    const a = base({ words: { cat: { ivl: 3, due: "2026-08-20", mastered: false, lapses: 0, learned: "2026-07-25" } } });
    const b = base({ words: { dog: { ivl: 1, due: "2026-08-10", mastered: false, lapses: 2, learned: "2026-07-26" } } });
    expect(Object.keys(mergeSaves([a, b])!.words).sort()).toEqual(["cat", "dog"]);
  });

  it("同一单词取更靠前的复习状态，且与合并顺序无关", () => {
    const a = base({ words: { cat: { ivl: 1, due: "2026-08-10", mastered: false, lapses: 0, learned: "2026-07-25" } } });
    const b = base({ words: { cat: { ivl: 4, due: "2026-08-25", mastered: false, lapses: 1, learned: "2026-07-25" } } });
    expect(mergeSaves([a, b])!.words.cat.ivl).toBe(4);
    expect(mergeSaves([b, a])!.words.cat.ivl).toBe(4);
  });

  it("已掌握的状态优先于未掌握", () => {
    const a = base({ words: { cat: { ivl: 4, due: "2026-09-01", mastered: true, lapses: 0, learned: "2026-07-25" } } });
    const b = base({ words: { cat: { ivl: 4, due: "2026-08-25", mastered: false, lapses: 3, learned: "2026-07-25" } } });
    expect(mergeSaves([a, b])!.words.cat.mastered).toBe(true);
  });

  it("同一天在不同设备上完成的任务全部保留", () => {
    const a = base({ daily: { "2026-08-08": day({ newTask: { idxs: [1, 2], done: true, known: 8 } }) } });
    const b = base({
      daily: { "2026-08-08": day({ quizTask: { done: true, locked: false, score: 5, total: 5 } }) },
    });
    const rec = mergeSaves([a, b])!.daily["2026-08-08"];
    expect(rec.newTask.done).toBe(true);
    expect(rec.quizTask.done).toBe(true);
    expect(rec.quizTask.score).toBe(5);
  });

  it("勋章与角色取并集，当前出战角色跟随 XP 更高的一方", () => {
    const a = base({ badges: ["x", "y"], agents: { unlocked: ["p"], current: "p" }, xp: 100 });
    const b = base({ badges: ["y", "z"], agents: { unlocked: ["q"], current: "q" }, xp: 50 });
    const m = mergeSaves([a, b])!;
    expect(m.badges.sort()).toEqual(["x", "y", "z"]);
    expect(m.agents.unlocked.sort()).toEqual(["p", "q"]);
    expect(m.agents.current).toBe("p");
  });

  it("空输入与非法存档返回 null，混入非法项时仍能合并出有效结果", () => {
    expect(mergeSaves([])).toBeNull();
    expect(mergeSaves([null, undefined])).toBeNull();
    expect(mergeSaves([null, base({ xp: 7 }), undefined])!.xp).toBe(7);
  });

  it("幂等：把合并结果再合并一次不会改变数值", () => {
    const a = base({
      xp: 500,
      badges: ["x"],
      words: { cat: { ivl: 2, due: "2026-08-15", mastered: false, lapses: 0, learned: "2026-07-25" } },
    });
    const b = base({ xp: 300, badges: ["y"] });
    const once = mergeSaves([a, b])!;
    expect(mergeSaves([once, b])).toEqual(once);
  });
});
