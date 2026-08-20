/**
 * 多设备存档合并。
 *
 * 云端每台设备独占一行（app = "<appId>#<deviceId>"），互不覆盖；
 * 读取时把同一应用的所有行合并成一份存档再使用。
 *
 * 合并的唯一准则：**只增不减，且绝不虚增**。
 * 累计类数值一律取 max —— 它们在单台设备上单调递增，取 max 等价于
 * "以进度最快的那台为准"；若改成相加，同一份进度会被重复计入。
 */

import type { DayRecord, SaveState, WordProgress } from "@/types";

const max = (a = 0, b = 0) => (a > b ? a : b);

/** 单词复习状态：取更靠前的那个（已掌握 > 阶段更高 > 到期更晚） */
function mergeWord(a: WordProgress, b: WordProgress): WordProgress {
  // 任一设备在测验里答对过就算过闸，必须显式带上：下面几个分支整份返回 a 或 b，
  // 漏掉就会把另一台设备挣来的过闸记录丢掉。
  const quizPassed = !!a.quizPassed || !!b.quizPassed;
  if (a.mastered !== b.mastered) return { ...(a.mastered ? a : b), quizPassed };
  if (a.ivl !== b.ivl) return { ...(a.ivl > b.ivl ? a : b), quizPassed };
  if (a.due !== b.due) return { ...(a.due > b.due ? a : b), quizPassed };
  // 状态等价时保留更早的首学日期与更高的失误计数（失误数用于统计，取大不丢信息）
  return { ...a, quizPassed, learned: a.learned < b.learned ? a.learned : b.learned, lapses: max(a.lapses, b.lapses) };
}

/** 每日任务：done 取或，计数取大 */
function mergeDay(a: DayRecord, b: DayRecord): DayRecord {
  return {
    date: a.date,
    xp: max(a.xp, b.xp),
    newTask: {
      // 任一设备做完就算做完；题目列表取更完整的那份
      idxs: a.newTask.idxs.length >= b.newTask.idxs.length ? a.newTask.idxs : b.newTask.idxs,
      done: a.newTask.done || b.newTask.done,
      known: max(a.newTask.known, b.newTask.known),
    },
    reviewTask: {
      words: a.reviewTask.words.length >= b.reviewTask.words.length ? a.reviewTask.words : b.reviewTask.words,
      done: a.reviewTask.done || b.reviewTask.done,
      known: max(a.reviewTask.known, b.reviewTask.known),
    },
    quizTask: {
      done: a.quizTask.done || b.quizTask.done,
      // locked 取与：只要有一台已解锁，就是解锁状态
      locked: a.quizTask.locked && b.quizTask.locked,
      score: max(a.quizTask.score, b.quizTask.score),
      total: max(a.quizTask.total, b.quizTask.total),
    },
    readingTask: {
      passageId: a.readingTask.done ? a.readingTask.passageId : b.readingTask.passageId,
      done: a.readingTask.done || b.readingTask.done,
      correct: max(a.readingTask.correct, b.readingTask.correct),
      total: max(a.readingTask.total, b.readingTask.total),
    },
    bonusGiven: a.bonusGiven || b.bonusGiven,
  };
}

function mergeTwo(a: SaveState, b: SaveState): SaveState {
  const words: Record<string, WordProgress> = { ...a.words };
  for (const [k, v] of Object.entries(b.words ?? {})) {
    const cur = words[k];
    words[k] = cur ? mergeWord(cur, v) : v;
  }

  const daily: Record<string, DayRecord> = { ...a.daily };
  for (const [d, rec] of Object.entries(b.daily ?? {})) {
    const cur = daily[d];
    daily[d] = cur ? mergeDay(cur, rec) : rec;
  }

  // 当前出战角色跟随 XP 更高的那份存档，避免两台设备来回打架
  const leader = (a.xp ?? 0) >= (b.xp ?? 0) ? a : b;

  return {
    version: 1,
    // 必须显式带上：这个对象是重建的，漏掉一个字段就等于把它从存档里抹掉。
    // xpRate 一旦丢失，已补过差的设备会被判为未迁移而再补一次。
    xpRate: max(a.xpRate ?? 1, b.xpRate ?? 1),
    quizGate: max(a.quizGate ?? 0, b.quizGate ?? 0),
    createdAt: a.createdAt < b.createdAt ? a.createdAt : b.createdAt,
    xp: max(a.xp, b.xp),
    wordCursor: max(a.wordCursor, b.wordCursor),
    words,
    daily,
    badges: Array.from(new Set([...(a.badges ?? []), ...(b.badges ?? [])])),
    agents: {
      unlocked: Array.from(new Set([...(a.agents?.unlocked ?? []), ...(b.agents?.unlocked ?? [])])),
      current: leader.agents?.current ?? a.agents?.current,
    },
    stats: {
      masteredCount: max(a.stats?.masteredCount, b.stats?.masteredCount),
      quizzesTaken: max(a.stats?.quizzesTaken, b.stats?.quizzesTaken),
      quizQuestions: max(a.stats?.quizQuestions, b.stats?.quizQuestions),
      quizCorrect: max(a.stats?.quizCorrect, b.stats?.quizCorrect),
      perfectQuizzes: max(a.stats?.perfectQuizzes, b.stats?.perfectQuizzes),
      readingsDone: max(a.stats?.readingsDone, b.stats?.readingsDone),
      readingsPerfect: max(a.stats?.readingsPerfect, b.stats?.readingsPerfect),
      bestCombo: max(a.stats?.bestCombo, b.stats?.bestCombo),
      wordsLearned: max(a.stats?.wordsLearned, b.stats?.wordsLearned),
      perfectDays: max(a.stats?.perfectDays, b.stats?.perfectDays),
      readingCorrect: max(a.stats?.readingCorrect, b.stats?.readingCorrect),
    },
  };
}

/** 合并任意多份存档；非法/空存档自动跳过，全空返回 null */
export function mergeSaves(saves: Array<SaveState | null | undefined>): SaveState | null {
  const valid = saves.filter((s): s is SaveState => !!s && s.version === 1);
  if (valid.length === 0) return null;
  return valid.reduce((acc, cur) => (acc === cur ? acc : mergeTwo(acc, cur)));
}
