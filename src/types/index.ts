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
  newTask: NewTask;
  reviewTask: ReviewTask;
  quizTask: QuizTask;
  readingTask: ReadingTask;
  bonusGiven: boolean;
}

export interface Stats {
  masteredCount: number;
  quizzesTaken: number;
  perfectQuizzes: number;
  readingsDone: number;
  readingsPerfect: number;
  bestCombo: number;
  wordsLearned: number; // total words ever entered SRS
  perfectDays: number;
}

export interface SaveState {
  version: 1;
  createdAt: string;
  xp: number;
  wordCursor: number; // next unlearned word global index
  words: Record<string, WordProgress>;
  daily: Record<string, DayRecord>;
  badges: string[];
  agents: { unlocked: string[]; current: string };
  stats: Stats;
}
