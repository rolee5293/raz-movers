/**
 * 统一发音链路：
 * 1. 首选 Free Dictionary API 真人录音（api.dictionaryapi.dev，支持 CORS），
 *    优先 -us.mp3 → -uk.mp3 → 任意非空 audio
 * 2. 录音 URL 双层缓存：内存 Map + localStorage（"pron:{word}"，仅存 URL 不存音频）
 * 3. 网络失败 / 无录音 / 请求超时 → 回退 speechSynthesis，挑高质量英文语音，rate 0.9
 * 4. 播放走「单例 + 首次手势解锁」的 HTMLAudioElement：
 *    iOS Safari 与安卓 Chrome 都禁止无用户手势的播放，且 await 之后手势授权已失效。
 *    因此在首次任意触摸时用静音音频把这个元素解锁，之后的异步播放才不会被拦截。
 */

const API_BASE = "https://api.dictionaryapi.dev/api/v2/entries/en/";
const LS_PREFIX = "pron:";
const NONE = "none";

/** 查询发音 URL 的超时：超时即走 TTS 回退，绝不让按钮永久转圈 */
const FETCH_TIMEOUT_MS = 2500;
/** 播放启动超时：这么久还没真正出声就判定失败，回退 TTS */
const PLAY_START_TIMEOUT_MS = 3000;
/** 单条录音最长播放时间兜底 */
const MAX_PLAY_MS = 12000;

/** 44 字节静音 WAV，仅用于首次手势解锁音频元素 */
const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";

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

/** 同步读缓存：命中就能在用户手势的同一个调用栈里直接播放，完全绕开自动播放策略 */
function cachedUrl(word: string): string | null | undefined {
  if (memCache.has(word)) return memCache.get(word);
  const v = lsGet(word);
  if (v !== undefined) memCache.set(word, v);
  return v;
}

/** 获取单词真人录音 URL（无录音返回 null；网络异常/超时不写入持久缓存，允许下次重试） */
export async function getPronUrl(rawWord: string): Promise<string | null> {
  const word = rawWord.toLowerCase().trim();
  if (!/^[a-z][a-z'-]*$/.test(word)) return null;
  const cached = cachedUrl(word);
  if (cached !== undefined) return cached;

  let url: string | null = null;
  let networkFailed = false;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(API_BASE + encodeURIComponent(word), { signal: ctrl.signal });
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
    networkFailed = true; // 含 abort 超时
  } finally {
    clearTimeout(timer);
  }

  memCache.set(word, url);
  if (!networkFailed) lsSet(word, url); // 网络异常不持久化，下次重试
  return url;
}

/** 后台预取，不阻塞 UI（用于提前把下一题的录音地址缓存好） */
export function prefetchPron(rawWord: string): void {
  const word = rawWord.toLowerCase().trim();
  if (!word || cachedUrl(word) !== undefined) return;
  void getPronUrl(word);
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

/* ================= 音频元素：单例 + 手势解锁 ================= */

let audioEl: HTMLAudioElement | null = null;
let unlocked = false;
/** 正在播放真实录音时不要去动 src，否则解锁逻辑会打断播放 */
let playingReal = false;

function getAudio(): HTMLAudioElement {
  if (!audioEl) {
    audioEl = new Audio();
    audioEl.preload = "auto";
    // iOS 内联播放，避免拉起全屏播放器
    audioEl.setAttribute("playsinline", "");
    audioEl.setAttribute("webkit-playsinline", "");
  }
  return audioEl;
}

/**
 * 必须在用户手势的同步调用栈里调用。
 * 用静音音频「点亮」单例元素，并预热 speechSynthesis；
 * 之后即使隔着 await 或定时器，播放也不会被自动播放策略拦截。
 */
export function unlockAudio(): void {
  if (unlocked || playingReal) return;
  try {
    const a = getAudio();
    a.src = SILENT_WAV;
    const p = a.play();
    if (p && typeof p.then === "function") {
      p.then(
        () => {
          unlocked = true;
        },
        () => {
          /* 本次手势解锁失败，下次手势再试 */
        }
      );
    } else {
      unlocked = true;
    }
  } catch {
    /* ignore */
  }
  try {
    if ("speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      window.speechSynthesis.speak(u);
      window.speechSynthesis.cancel();
    }
  } catch {
    /* ignore */
  }
}

/** 在应用启动时调用一次：首个用户手势自动解锁音频，解锁成功后自动摘除监听 */
export function installAudioUnlock(): void {
  if (typeof window === "undefined") return;
  const events: Array<keyof WindowEventMap> = ["pointerdown", "touchend", "keydown"];
  const handler = () => {
    unlockAudio();
    if (unlocked) events.forEach((e) => window.removeEventListener(e, handler, true));
  };
  events.forEach((e) => window.addEventListener(e, handler, true));
}

/* ================= 播放控制 ================= */

export function stopAllAudio() {
  if (audioEl) {
    try {
      audioEl.pause();
      audioEl.currentTime = 0;
    } catch {
      /* ignore */
    }
  }
  playingReal = false;
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

function playAudio(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const audio = getAudio();
    let settled = false;
    let started = false;

    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      playingReal = false;
      audio.onplaying = null;
      audio.onended = null;
      audio.onerror = null;
      resolve(ok);
    };

    audio.onplaying = () => {
      started = true;
    };
    audio.onended = () => done(true);
    audio.onerror = () => done(false);

    try {
      audio.pause();
      audio.currentTime = 0;
    } catch {
      /* ignore */
    }

    playingReal = true;
    audio.src = url;
    const p = audio.play();
    if (p && typeof p.catch === "function") p.catch(() => done(false));

    // 一直没真正出声（被拦截 / 加载不出来）→ 判失败，交给 TTS 回退
    setTimeout(() => {
      if (!started) done(false);
    }, PLAY_START_TIMEOUT_MS);
    // onended 不触发的兜底
    setTimeout(() => done(started), MAX_PLAY_MS);
  });
}

export type SpeakPhase = "loading" | "playing" | "done";

/**
 * 统一单词发音入口：真人录音优先，失败回退高质量 TTS。
 * 缓存命中时同步播放（不经过 await），最大限度保留用户手势授权。
 * onPhase 回调用于按钮加载态/播放态。
 */
export async function speakWord(rawWord: string, onPhase?: (p: SpeakPhase) => void): Promise<void> {
  const word = rawWord.trim();
  if (!word) return;

  // 缓存命中：直接播，避免 await 打断手势授权
  const cached = cachedUrl(word.toLowerCase());
  if (cached !== undefined) {
    stopAllAudio();
    if (cached) {
      onPhase?.("playing");
      const ok = await playAudio(cached);
      if (ok) {
        onPhase?.("done");
        return;
      }
    }
    onPhase?.("playing");
    await speakAsync(word, 0.9);
    onPhase?.("done");
    return;
  }

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
