/**
 * 统一发音链路：
 * 1. 首选 Free Dictionary API 真人录音（api.dictionaryapi.dev，支持 CORS），
 *    优先 -us.mp3 → -uk.mp3 → 任意非空 audio
 * 2. 录音 URL 双层缓存：内存 Map + localStorage（"pron:{word}"，仅存 URL 不存音频）
 * 3. 网络失败 / 无录音 → 回退 speechSynthesis，挑高质量英文语音，rate 0.9
 * 4. HTMLAudioElement 播放；全局单实例，新播放会停掉上一个
 */

const API_BASE = "https://api.dictionaryapi.dev/api/v2/entries/en/";
const LS_PREFIX = "pron:";
const NONE = "none";

const memCache = new Map<string, string | null>();

function lsGet(word: string): string | null | undefined {
  try {
    const v = localStorage.getItem(LS_PREFIX + word);
    if (v === null) return undefined; // 未缓存
    return v === NONE ? null : v;
  } catch {
    return undefined;
  }
}

function lsSet(word: string, url: string | null) {
  try {
    localStorage.setItem(LS_PREFIX + word, url ?? NONE);
  } catch {
    /* storage full — ignore */
  }
}

/** 获取单词真人录音 URL（无录音返回 null；网络异常不写入持久缓存，允许下次重试） */
export async function getPronUrl(rawWord: string): Promise<string | null> {
  const word = rawWord.toLowerCase().trim();
  if (!/^[a-z][a-z'-]*$/.test(word)) return null;
  if (memCache.has(word)) return memCache.get(word) ?? null;
  const cached = lsGet(word);
  if (cached !== undefined) {
    memCache.set(word, cached);
    return cached;
  }

  let url: string | null = null;
  let networkFailed = false;
  try {
    const res = await fetch(API_BASE + encodeURIComponent(word));
    if (res.ok) {
      const data = (await res.json()) as Array<{
        phonetics?: Array<{ audio?: string }>;
      }>;
      const audios: string[] = [];
      for (const entry of data ?? []) {
        for (const p of entry.phonetics ?? []) {
          if (p.audio) audios.push(p.audio);
        }
      }
      url =
        audios.find((a) => a.includes("-us.mp3")) ??
        audios.find((a) => a.includes("-uk.mp3")) ??
        audios[0] ??
        null;
    } else if (res.status !== 404) {
      networkFailed = true; // 5xx 等临时故障
    }
  } catch {
    networkFailed = true;
  }

  memCache.set(word, url);
  if (!networkFailed) lsSet(word, url); // 网络异常不持久化，下次重试
  return url;
}

/* ================= TTS（回退 & 句子朗读） ================= */

function pickVoice(): SpeechSynthesisVoice | null {
  if (!("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  const en = voices.filter((v) => /^en([-_]|$)/i.test(v.lang));
  const good = en.filter((v) => /google|samantha|daniel|premium|enhanced/i.test(v.name));
  const pool = good.length > 0 ? good : en;
  return (
    pool.find((v) => /en[-_]US/i.test(v.lang)) ??
    pool.find((v) => /en[-_]GB/i.test(v.lang)) ??
    pool[0] ??
    null
  );
}

if (typeof window !== "undefined" && "speechSynthesis" in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    /* 触发一次 pickVoice 预热缓存的 voices 列表 */
    pickVoice();
  };
}

export function speakAsync(text: string, rate = 0.9): Promise<void> {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) return resolve();
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US";
      u.rate = rate;
      const v = pickVoice();
      if (v) u.voice = v;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      window.speechSynthesis.speak(u);
      // 部分平台 onend 不触发的保险
      setTimeout(resolve, Math.max(2500, text.length * 160));
    } catch {
      resolve();
    }
  });
}

/* ================= 播放控制 ================= */

let currentAudio: HTMLAudioElement | null = null;

export function stopAllAudio() {
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    } catch {
      /* ignore */
    }
    currentAudio = null;
  }
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

function playAudio(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok: boolean) => {
      if (!settled) {
        settled = true;
        resolve(ok);
      }
    };
    const audio = new Audio();
    currentAudio = audio;
    audio.preload = "auto";
    audio.onended = () => done(true);
    audio.onerror = () => done(false);
    audio.src = url;
    audio.play().catch(() => done(false));
    setTimeout(() => done(true), 15000); // 保险
  });
}

export type SpeakPhase = "loading" | "playing" | "done";

/**
 * 统一单词发音入口：真人录音优先，失败回退高质量 TTS。
 * onPhase 回调用于按钮加载态/播放态。
 */
export async function speakWord(rawWord: string, onPhase?: (p: SpeakPhase) => void): Promise<void> {
  const word = rawWord.trim();
  if (!word) return;
  onPhase?.("loading");
  const url = await getPronUrl(word);
  stopAllAudio();
  if (url) {
    onPhase?.("playing");
    const ok = await playAudio(url);
    if (ok) {
      onPhase?.("done");
      return;
    }
    // 录音加载失败 → 继续走 TTS 回退
  }
  onPhase?.("playing");
  await speakAsync(word, 0.9);
  onPhase?.("done");
}

/** 句子朗读（TTS，不等待）——例句等长文本用 */
export function speak(text: string, rate = 0.92) {
  void speakAsync(text, rate);
}
