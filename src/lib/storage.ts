import type { DayRecord, SaveState, Word, WordProgress } from "@/types";
import type { BadgeHelpers } from "@/lib/game";

const KEY = "raz-movers-save-v1";

export const SRS_STEPS = [1, 2, 4, 7, 15];
export const DAILY_NEW_WORDS = 10;
/**
 * 每日复习上限。是天花板不是配额——dueReviewWords 只返回当天真正到期的词。
 * 稳态需求 = DAILY_NEW_WORDS × SRS_STEPS.length，必须留出余量，
 * 否则到期量长期超过上限，队列发散、SRS 间隔被静默拉长，"已掌握"永远涨不动。
 */
export const DAILY_REVIEW_CAP = 65;

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

/* ================= XP 费率 ================= */

/**
 * 统一后的 XP 费率——两个应用必须完全一致。
 * 上线时两边各自调校过（弟弟那套约为哥哥的三分之一），配套的段位门槛也调低了，
 * 本来能相抵；但两人都打满 RADIANT III 之后段位不再有区分度，
 * 屏幕上只剩 TOTAL XP 这个裸数字，干得多的一方反而分低。2026-08-18 统一。
 */
export const XP = {
  wordPerKnown: 2,
  wordBase: 10,
  /**
   * 复习单价独立于新词，且高于测验的每题分。
   * 复习是唯一能推动"已掌握"的动作，却一度是全场单价最低的（2 XP/张，
   * 而测验一题 10 XP 且可无限加练）——孩子理性地去刷测验，掌握数就永远不动。
   */
  reviewPerKnown: 8,
  /** 当天复习任务做完的完成奖。cap 调高后复习变长，需要一个终点 */
  reviewClearBonus: 40,
  /** 每有一个词达成"已掌握"的奖励：为结果付钱，不只为动作付钱 */
  masteredBonus: 20,
  quizPerCorrect: 10,
  quizPerfect: 50,
  readPerCorrect: 10,
  readBase: 30,
  readPerfect: 30,
  dailyBonus: 50,
} as const;

/** 本应用上线时的旧费率。只用于一次性补差，不要用于任何新增分值 */
const LEGACY_XP = {
  wordPerKnown: 1,
  wordBase: 5,
  quizPerCorrect: 8,
  quizPerfect: 10,
  readPerCorrect: 5,
  readBase: 10,
  readPerfect: 5,
  dailyBonus: 20,
} as const;

/**
 * 一次性历史补差：把旧费率下攒出来的 XP 换算成统一费率下的等值分数。
 *
 * 不是简单乘一个倍数，而是按存档里的真实活动逐项重算，所以补出来的分
 * 每一分都对得上他自己做过的题。阅读没有单独记累计答对数，用总 XP 扣掉
 * 其余分项反推——残差法保证按旧费率能精确还原历史总分（8 台设备实测残差均为正）。
 *
 * 幂等由 xpRate 标记保证，该标记必须在 mergeSaves 里显式传递。
 */
export function migrateXpRate(save: SaveState): SaveState {
  if ((save.xpRate ?? 1) >= 2) return save;

  let known = 0;
  let tasks = 0;
  for (const rec of Object.values(save.daily ?? {})) {
    if (rec.newTask?.done) {
      tasks++;
      known += rec.newTask.known ?? 0;
    }
    if (rec.reviewTask?.done) {
      tasks++;
      known += rec.reviewTask.known ?? 0;
    }
  }
  const st = save.stats;
  const legacyOther =
    known * LEGACY_XP.wordPerKnown +
    tasks * LEGACY_XP.wordBase +
    st.quizCorrect * LEGACY_XP.quizPerCorrect +
    st.perfectQuizzes * LEGACY_XP.quizPerfect +
    st.perfectDays * LEGACY_XP.dailyBonus;
  const readingCorrect = Math.round(
    (save.xp -
      legacyOther -
      st.readingsDone * LEGACY_XP.readBase -
      st.readingsPerfect * LEGACY_XP.readPerfect) /
      LEGACY_XP.readPerCorrect,
  );

  // 存档异常（残差为负或非有限）时只打标记不改分：宁可不补，也不能把分算坏
  if (!Number.isFinite(readingCorrect) || readingCorrect < 0) {
    return { ...save, xpRate: 2 };
  }

  const recomputed =
    known * XP.wordPerKnown +
    tasks * XP.wordBase +
    st.quizCorrect * XP.quizPerCorrect +
    st.perfectQuizzes * XP.quizPerfect +
    readingCorrect * XP.readPerCorrect +
    st.readingsDone * XP.readBase +
    st.readingsPerfect * XP.readPerfect +
    st.perfectDays * XP.dailyBonus;

  // 只增不减
  const xp = Math.max(save.xp, recomputed);

  // 家长看板的 14 天柱状图读的是每日 xp，不同步放大的话总分跳了、图还是旧刻度
  const ratio = save.xp > 0 ? xp / save.xp : 1;
  const daily =
    ratio === 1
      ? save.daily
      : Object.fromEntries(
          Object.entries(save.daily ?? {}).map(([d, rec]) => [
            d,
            rec.xp ? { ...rec, xp: Math.round(rec.xp * ratio) } : rec,
          ]),
        );

  return { ...save, xp, xpRate: 2, daily, stats: { ...st, readingCorrect } };
}

/* ================= 存档 ================= */


function defaultSave(): SaveState {
  return {
    version: 1,
    xpRate: 2,
    quizGate: 1,
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
      quizQuestions: 0,
      quizCorrect: 0,
      perfectQuizzes: 0,
      readingsDone: 0,
      readingsPerfect: 0,
      bestCombo: 0,
      wordsLearned: 0,
      perfectDays: 0,
      readingCorrect: 0,
    },
  };
}

/**
 * 测验闸迁移：闸是新加的，旧存档里的词都没有 quizPassed 标记。
 * 不放行的话它们会被永久卡在最后一步——等于用新规矩追罚已经做完的功课。
 * 一次性把已有词视为已过闸，闸只对之后新学的词生效。
 */
export function migrateQuizGate(save: SaveState): SaveState {
  if ((save.quizGate ?? 0) >= 1) return save;
  const words: Record<string, WordProgress> = {};
  for (const [k, v] of Object.entries(save.words ?? {})) words[k] = { ...v, quizPassed: true };
  return { ...save, words, quizGate: 1 };
}

export function loadSave(): SaveState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSave();
    const parsed = JSON.parse(raw) as SaveState;
    if (parsed.version !== 1) return defaultSave();
    // xpRate 必须显式取 parsed 的值：展开时"键不存在"不会覆盖 defaultSave() 的 2，
    // 旧存档会被当成已补差而跳过迁移——补差就永远不会发生。
    return migrateQuizGate(migrateXpRate({
      ...defaultSave(),
      ...parsed,
      xpRate: parsed.xpRate ?? 1,
      quizGate: parsed.quizGate ?? 0,
      stats: { ...defaultSave().stats, ...parsed.stats },
    }));
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
    xp: 0,
  };
  const next: SaveState = { ...save, daily: { ...save.daily, [date]: rec } };
  return { save: next, rec };
}

/* ================= SRS 操作 ================= */

/** 学习/复习一个词。known=true 推进间隔，false 重置到明天 */
export function gradeWord(prev: WordProgress | undefined, known: boolean, today: string): WordProgress {
  if (!prev) {
    // 新词首次学习
    // 一眼就认得的词直接进第二步，省掉一轮——否则孩子本来就会的词也要走满全程
    const ivl = known ? 1 : 0;
    return {
      ivl,
      due: addDaysStr(today, SRS_STEPS[ivl]),
      mastered: false,
      lapses: known ? 0 : 1,
      learned: today,
    };
  }
  if (known) {
    const nextIvl = prev.ivl + 1;
    if (nextIvl >= SRS_STEPS.length) {
      // 间隔走完还不够：没在测验里客观答对过，就压在最后一步继续轮换，
      // 直到它在测验里露过面并答对。否则一路点"认得"就能刷出满屏"已掌握"。
      if (!prev.quizPassed) {
        return { ...prev, ivl: SRS_STEPS.length - 1, due: addDaysStr(today, SRS_STEPS[SRS_STEPS.length - 1]) };
      }
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
