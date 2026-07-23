import type { DayRecord, SaveState, Word, WordProgress } from "@/types";
import type { BadgeHelpers } from "@/lib/game";

const KEY = "raz-movers-save-v1";

export const SRS_STEPS = [1, 2, 4, 7, 15];
export const DAILY_NEW_WORDS = 10;
export const DAILY_REVIEW_CAP = 25;

/* ================= 日期工具 ================= */

export function todayStr(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return todayStr(d);
}

/* ================= 存档 ================= */

function defaultSave(): SaveState {
  return {
    version: 1,
    createdAt: todayStr(),
    xp: 0,
    wordCursor: 0,
    words: {},
    daily: {},
    badges: [],
    agents: { unlocked: ["sage-01"], current: "sage-01" },
    stats: {
      masteredCount: 0,
      quizzesTaken: 0,
      perfectQuizzes: 0,
      readingsDone: 0,
      readingsPerfect: 0,
      bestCombo: 0,
      wordsLearned: 0,
      perfectDays: 0,
    },
  };
}

export function loadSave(): SaveState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSave();
    const parsed = JSON.parse(raw) as SaveState;
    if (parsed.version !== 1) return defaultSave();
    return { ...defaultSave(), ...parsed, stats: { ...defaultSave().stats, ...parsed.stats } };
  } catch {
    return defaultSave();
  }
}

export function persist(save: SaveState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    /* storage full — ignore */
  }
}

/* ================= streak & 任务状态 ================= */

export function isDayAllDone(rec: DayRecord | undefined): boolean {
  if (!rec) return false;
  return rec.newTask.done && rec.reviewTask.done && rec.quizTask.done && rec.readingTask.done;
}

/** 当前连续打卡天数（今天或昨天为末端）与历史最长 */
export function streakInfo(save: SaveState): { current: number; max: number } {
  let max = 0;
  const doneDates = Object.keys(save.daily)
    .filter((d) => isDayAllDone(save.daily[d]))
    .sort();
  let run = 0;
  let prev: string | null = null;
  for (const d of doneDates) {
    run = prev && addDaysStr(prev, 1) === d ? run + 1 : 1;
    if (run > max) max = run;
    prev = d;
  }
  // current: run ending today or yesterday
  const today = todayStr();
  let current = 0;
  let cursor = isDayAllDone(save.daily[today]) ? today : addDaysStr(today, -1);
  while (isDayAllDone(save.daily[cursor])) {
    current++;
    cursor = addDaysStr(cursor, -1);
  }
  return { current, max };
}

export function badgeHelpers(save: SaveState): BadgeHelpers {
  const s = streakInfo(save);
  return { streak: s.current, maxStreak: s.max };
}

/* ================= 每日任务生成 ================= */

/** 到期复习词（state=learning 且 due <= today），按到期日升序，限量 */
export function dueReviewWords(save: SaveState, date: string, cap = DAILY_REVIEW_CAP): string[] {
  return Object.entries(save.words)
    .filter(([, p]) => !p.mastered && p.due <= date)
    .sort((a, b) => (a[1].due < b[1].due ? -1 : 1))
    .slice(0, cap)
    .map(([w]) => w);
}

/** 为某天生成（或读取已有）任务记录 */
export function ensureDayRecord(save: SaveState, date: string, totalWords: number): { save: SaveState; rec: DayRecord } {
  const existing = save.daily[date];
  if (existing) return { save, rec: existing };

  const cursor = save.wordCursor;
  const idxs: number[] = [];
  for (let i = cursor; i < Math.min(cursor + DAILY_NEW_WORDS, totalWords); i++) idxs.push(i);

  const reviewWords = dueReviewWords(save, date);
  const learnedPool = cursor; // 已学词数
  const quizLocked = learnedPool < 4;

  const rec: DayRecord = {
    date,
    newTask: { idxs, done: idxs.length === 0, known: 0 },
    reviewTask: { words: reviewWords, done: reviewWords.length === 0, known: 0 },
    quizTask: { done: quizLocked, locked: quizLocked, score: 0, total: 0 },
    readingTask: { passageId: -1, done: false, correct: 0, total: 0 },
    bonusGiven: false,
  };
  const next: SaveState = { ...save, daily: { ...save.daily, [date]: rec } };
  return { save: next, rec };
}

/* ================= SRS 操作 ================= */

/** 学习/复习一个词。known=true 推进间隔，false 重置到明天 */
export function gradeWord(prev: WordProgress | undefined, known: boolean, today: string): WordProgress {
  if (!prev) {
    // 新词首次学习
    return {
      ivl: known ? 0 : 0,
      due: addDaysStr(today, 1),
      mastered: false,
      lapses: known ? 0 : 1,
      learned: today,
    };
  }
  if (known) {
    const nextIvl = prev.ivl + 1;
    if (nextIvl >= SRS_STEPS.length) {
      return { ...prev, ivl: SRS_STEPS.length - 1, mastered: true, due: addDaysStr(today, 365) };
    }
    return { ...prev, ivl: nextIvl, due: addDaysStr(today, SRS_STEPS[nextIvl]) };
  }
  return { ...prev, ivl: 0, due: addDaysStr(today, 1), lapses: prev.lapses + 1 };
}

/** 更新 masteredCount 统计 */
export function recountMastered(words: Record<string, WordProgress>): number {
  return Object.values(words).filter((w) => w.mastered).length;
}

/* ================= 测验抽题 ================= */

export interface QuizItem {
  type: "en2zh" | "zh2en" | "listen" | "spell";
  word: Word;
  options?: string[];
  answer?: number;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickDistractors(pool: Word[], exclude: Word, n: number, field: "meaning" | "word"): string[] {
  const seen = new Set<string>([exclude[field]]);
  const out: string[] = [];
  for (const w of shuffle(pool)) {
    if (w.idx === exclude.idx) continue;
    const v = w[field];
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length === n) break;
  }
  return out;
}

const TYPE_PATTERN: QuizItem["type"][] = ["en2zh", "zh2en", "listen", "zh2en", "spell"];

export function generateQuiz(learnedPool: Word[], count = 5): QuizItem[] {
  const usable = learnedPool.filter((w) => w.meaning);
  const picked = shuffle(usable).slice(0, Math.min(count, usable.length));
  return picked.map((word, i) => {
    const type = TYPE_PATTERN[i % TYPE_PATTERN.length];
    if (type === "spell") return { type, word };
    if (type === "en2zh") {
      const distractors = pickDistractors(usable, word, 3, "meaning");
      const options = shuffle([word.meaning, ...distractors]);
      return { type, word, options, answer: options.indexOf(word.meaning) };
    }
    // zh2en / listen —— 选项都是英文单词
    const distractors = pickDistractors(usable, word, 3, "word");
    const options = shuffle([word.word, ...distractors]);
    return { type, word, options, answer: options.indexOf(word.word) };
  });
}
