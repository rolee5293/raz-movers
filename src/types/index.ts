export interface Word {
  word: string;
  phonetic: string;
  pos: string;
  meaning: string;
  example: string;
  exampleCn: string;
  listId: number;
  idx: number; // global flattened index
}

export interface QuizQuestion {
  q: string;
  options: string[];
  answer: number; // 0-3
  explanation: string;
}

export interface Passage {
  id: number;
  title: string;
  difficulty: 1 | 2 | 3;
  topic: string;
  wordCount: number;
  text: string;
  questions: QuizQuestion[];
}

/** Per-word SRS progress */
export interface WordProgress {
  ivl: number; // index into SRS_STEPS [1,2,4,7,15]
  due: string; // YYYY-MM-DD
  mastered: boolean;
  lapses: number;
  learned: string; // date first learned
}

export interface NewTask {
  idxs: number[];
  done: boolean;
  known: number;
}
export interface ReviewTask {
  words: string[]; // word keys
  done: boolean;
  known: number;
}
export interface QuizTask {
  done: boolean;
  locked: boolean;
  score: number;
  total: number;
}
export interface ReadingTask {
  passageId: number;
  done: boolean;
  correct: number;
  total: number;
}

export interface DayRecord {
  date: string;
  xp?: number; // 当日获得 XP（家长看板用）
  newTask: NewTask;
  reviewTask: ReviewTask;
  quizTask: QuizTask;
  readingTask: ReadingTask;
  bonusGiven: boolean;
}

export interface Stats {
  masteredCount: number;
  quizzesTaken: number;
  quizQuestions: number; // 累计答题数
  quizCorrect: number; // 累计答对数
  perfectQuizzes: number;
  readingsDone: number;
  readingsPerfect: number;
  bestCombo: number;
  wordsLearned: number; // total words ever entered SRS
  perfectDays: number;
  /** 阅读累计答对题数。v1 存档没有这一项，迁移时由历史 XP 反推补齐 */
  readingCorrect?: number;
}

export interface SaveState {
  version: 1;
  /**
   * XP 费率版本。1 = 上线时各自调校的旧费率，2 = 两个应用统一后的费率。
   * 单独于 version 之外，是因为 version 承担存档结构兼容（loadSave 与 mergeSaves
   * 都硬校验 === 1），一旦改动旧存档会被整份丢弃。
   * 缺失视为 1，loadSave 时补差一次并置为 2；必须在 mergeSaves 里显式传递，
   * 否则一次云端合并就会抹掉标记、导致重复补差。
   */
  xpRate?: number;
  createdAt: string;
  xp: number;
  wordCursor: number; // next unlearned word global index
  words: Record<string, WordProgress>;
  daily: Record<string, DayRecord>;
  badges: string[];
  agents: { unlocked: string[]; current: string };
  stats: Stats;
}
