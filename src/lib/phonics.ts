/**
 * 自然拼读（Phonics）启发式音节拆分器 —— 纯前端，无需词典。
 *
 * 规则概要：
 * 1. 元音核识别：ai/ay/ee/ea/ou/ow 等双字母元音组合算一个核；y 前面是辅音时算元音。
 * 2. 词尾不发音 e 不单独成音节；但辅音 + le 结尾（ta-ble）保留成音节。
 * 3. 两个元音核之间的辅音分配：
 *    - 0 个辅音：直接断开（hiatus，如 ti·on 不适用因 io 是组合，ar·e·a 适用）
 *    - 1 个辅音：一般归后一个音节（ti·ger）；'r' 归前（ver·y、em·per·or）
 *    - 2+ 个辅音：若尾部是常见辅音丛（bl/br/st/str/ch/sh/th…）则整丛归后（ta·ble），
 *      否则从中间拆开（em·per、im·por·tant）
 * 4. 重音启发：-tion/-sion/-ic/-ity 等后缀前一个音节重读；
 *    re/de/pre/com/im/in/ex/un 等前缀词重读第二音节；其余默认首音节重读。
 */

const DIGRAPHS = [
  "ai", "ay", "au", "aw", "ea", "ee", "ei", "eu", "ew", "ey",
  "ia", "ie", "io", "oa", "oe", "oi", "oo", "ou", "ow", "oy",
  "ue", "ui", "uy",
];

const ONSETS = new Set([
  "bl", "br", "ch", "cl", "cr", "dr", "dw", "fl", "fr", "gh", "gl",
  "gn", "gr", "kn", "ph", "pl", "pr", "ps", "qu", "sc", "sh", "sk",
  "sl", "sm", "sn", "sp", "st", "sw", "th", "tr", "tw", "wh", "wr",
  "chr", "sch", "scr", "shr", "spl", "spr", "squ", "str", "thr",
]);

const STRESS_PREFIXES = [
  "re", "de", "pre", "pro", "com", "con", "im", "in", "ex", "dis",
  "un", "be", "sub", "mis", "non", "ad", "ob", "per", "sur",
];

const STRESS_BEFORE_SUFFIX = [
  "tion", "sion", "ic", "ical", "ity", "ious", "eous", "ial",
  "ian", "itude", "graphy", "ology",
];

const VOWELS = "aeiou";
const VOWELS_Y = "aeiouy";

interface Nucleus {
  start: number; // 含
  end: number; // 不含
}

export interface PhonicsResult {
  syllables: string[];
  stress: number; // 重读音节下标
}

export function phonicsOf(rawWord: string): PhonicsResult {
  const word = rawWord.toLowerCase().replace(/[^a-z]/g, "");
  if (word.length < 3) return { syllables: [rawWord], stress: 0 };

  /* 1. 找元音核 */
  const nuclei: Nucleus[] = [];
  let i = 0;
  while (i < word.length) {
    const two = word.slice(i, i + 2);
    if (DIGRAPHS.includes(two)) {
      nuclei.push({ start: i, end: i + 2 });
      i += 2;
      continue;
    }
    const c = word[i];
    const prev = i > 0 ? word[i - 1] : "";
    if (VOWELS.includes(c) || (c === "y" && i > 0 && !VOWELS_Y.includes(prev))) {
      nuclei.push({ start: i, end: i + 1 });
    }
    i++;
  }

  /* 2. 词尾不发音 e（辅音+le 结尾除外） */
  if (nuclei.length >= 2) {
    const last = nuclei[nuclei.length - 1];
    const isFinalSingleE =
      last.start === word.length - 1 && word[last.start] === "e" && last.end - last.start === 1;
    if (isFinalSingleE) {
      const beforeE = word[last.start - 1] ?? "";
      const beforeThat = word[last.start - 2] ?? "";
      const isLeEnding = beforeE === "l" && beforeThat !== "" && !VOWELS_Y.includes(beforeThat);
      if (!isLeEnding) nuclei.pop();
    }
  }

  if (nuclei.length <= 1) return { syllables: [rawWord], stress: 0 };

  /* 3. 辅音分配 → 音节边界 */
  const bounds: number[] = [];
  for (let n = 0; n < nuclei.length - 1; n++) {
    const s = nuclei[n].end;
    const e = nuclei[n + 1].start;
    const cons = word.slice(s, e);
    if (cons.length === 0) {
      bounds.push(s);
    } else if (cons.length === 1) {
      // 单辅音归后；'r' 归前（ver·y / em·per·or / ar·e·a）
      bounds.push(cons === "r" ? e : s);
    } else {
      // 尾部最长常见辅音丛归后，否则中间拆开
      let onsetLen = 0;
      for (let L = Math.min(3, cons.length); L >= 2; L--) {
        if (ONSETS.has(cons.slice(cons.length - L))) {
          onsetLen = L;
          break;
        }
      }
      bounds.push(onsetLen > 0 ? e - onsetLen : s + Math.floor(cons.length / 2));
    }
  }

  /* 4. 切分 */
  const syllables: string[] = [];
  let prev = 0;
  for (const b of bounds) {
    syllables.push(word.slice(prev, b));
    prev = b;
  }
  syllables.push(word.slice(prev));

  /* 5. 重音启发 */
  const n = syllables.length;
  let stress = 0;
  if (n >= 2) {
    if (STRESS_BEFORE_SUFFIX.some((sfx) => word.endsWith(sfx))) {
      stress = Math.max(0, n - 2);
    } else if (STRESS_PREFIXES.some((p) => word.startsWith(p) && word.length > p.length + 2)) {
      stress = 1;
    }
  }

  return { syllables, stress };
}
