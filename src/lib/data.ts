import type { Passage, Word } from "@/types";

// 合并后的单文件数据（构建脚本由 data_src/ 生成到 public/data/）
const VOCAB_FILES = ["vocab.json"];
const READING_FILES = ["reading.json"];

const base = import.meta.env.BASE_URL || "./";

let vocabCache: Word[] | null = null;
let readingCache: Passage[] | null = null;

interface RawList {
  id: number;
  title: string;
  words: Array<Partial<Word> & { word: string }>;
}

export async function loadVocab(): Promise<Word[]> {
  if (vocabCache) return vocabCache;
  const all: Word[] = [];
  let idx = 0;
  for (const f of VOCAB_FILES) {
    const res = await fetch(`${base}data/${f}`);
    const json = (await res.json()) as { lists: RawList[] };
    for (const list of json.lists) {
      for (const w of list.words) {
        all.push({
          word: w.word,
          phonetic: w.phonetic || "",
          pos: w.pos || "",
          meaning: w.meaning || "",
          example: w.example || "",
          exampleCn: w.exampleCn || "",
          listId: list.id,
          idx: idx++,
        });
      }
    }
  }
  vocabCache = all;
  return all;
}

export async function loadReading(): Promise<Passage[]> {
  if (readingCache) return readingCache;
  const all: Passage[] = [];
  for (const f of READING_FILES) {
    const res = await fetch(`${base}data/${f}`);
    const json = (await res.json()) as { passages: Passage[] };
    all.push(...json.passages);
  }
  // 按难度循环推进：难度 1 → 2 → 3，同级按 id
  all.sort((a, b) => a.difficulty - b.difficulty || a.id - b.id);
  readingCache = all;
  return all;
}
