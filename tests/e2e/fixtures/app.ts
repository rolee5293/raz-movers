/**
 * 学习端测试夹具。
 *
 * 三件事必须由夹具统一接管，否则测试要么污染生产数据、要么结果不可复现：
 *  1. Supabase：应用任何存档变化都会自动上传，直连线上会写进孩子的真实存档
 *  2. 发音 API：真实网络的快慢会让"超时回退"这类用例随机通过或失败
 *  3. 音频与语音合成：无头浏览器不会真的出声，改为记录调用以断言链路是否被触发
 */
import { test as base, type Page } from "@playwright/test";

/**
 * 一律用正则匹配，不用 glob。
 * glob 的 `**` 匹配的是路径分段，`**\/api.dictionaryapi.dev/**` 命中不了
 * 主机名紧跟在 https:// 之后的地址，桩会静默失效、测试转而打到真实外网。
 */
const SUPA = /\/rest\/v1\/progress/;
const DICT = /^https:\/\/api\.dictionaryapi\.dev\//;
const AUDIO_CDN = /^https:\/\/cdn\.test\//;

/** 云端一行 */
export interface CloudRow {
  app: string;
  data: unknown;
  updated_at: string;
}

/** 被记录下来的一次上传 */
export interface Upload {
  app: string;
  data: Record<string, unknown>;
  updated_at: string;
}

/** 播放/朗读调用记录 */
export interface AudioLog {
  plays: Array<{ src: string; blockedByPolicy: boolean }>;
  tts: string[];
}

export class CloudStub {
  rows: CloudRow[] = [];
  uploads: Upload[] = [];
  /** GET 延迟毫秒数，用来复现"下载慢于上传防抖"的竞态 */
  downloadDelayMs = 0;
  /** 置真则所有云端请求失败，验证离线降级 */
  offline = false;

  async install(page: Page) {
    await page.route(SUPA, async (route) => {
      const req = route.request();
      if (this.offline) return route.abort("failed");

      if (req.method() === "GET") {
        if (this.downloadDelayMs > 0) await new Promise((r) => setTimeout(r, this.downloadDelayMs));
        const url = new URL(req.url());
        const filter = url.searchParams.get("app") ?? "";
        // 还原 PostgREST 的 like.<prefix>* 语义
        const m = /^like\.(.+?)\*?$/.exec(filter);
        const rows = m ? this.rows.filter((r) => r.app.startsWith(m[1])) : this.rows;
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rows) });
      }

      if (req.method() === "POST") {
        const body = JSON.parse(req.postData() ?? "{}") as Upload;
        this.uploads.push(body);
        const idx = this.rows.findIndex((r) => r.app === body.app);
        const row: CloudRow = { app: body.app, data: body.data, updated_at: body.updated_at };
        if (idx >= 0) this.rows[idx] = row;
        else this.rows.push(row);
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([row]) });
      }

      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    });
  }

  /** 本次上传写入的行标识（取最后一次） */
  lastRowKey(): string | undefined {
    return this.uploads[this.uploads.length - 1]?.app;
  }
}

export class DictStub {
  /** 有真人录音时返回的 mp3 地址 */
  audioUrl: string | null = "https://cdn.test/river-us.mp3";
  /** 置真则请求一直挂起，用来验证 2.5 秒超时后回退 TTS */
  hang = false;
  /** 置真则返回 500 */
  serverError = false;

  async install(page: Page) {
    // 录音文件本身也拦截，避免测试机真的去下载
    await page.route(AUDIO_CDN, (route) =>
      route.fulfill({ status: 200, contentType: "audio/mpeg", body: Buffer.from([0xff, 0xfb, 0x90, 0x00]) })
    );
    await page.route(DICT, async (route) => {
      if (this.hang) {
        await new Promise((r) => setTimeout(r, 15_000));
        return route.abort("timedout");
      }
      if (this.serverError) return route.fulfill({ status: 500, body: "" });
      const phonetics = this.audioUrl ? [{ audio: this.audioUrl }] : [];
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{ phonetics }]),
      });
    });
  }
}

/**
 * 注入音频探针。
 * 无头浏览器不会真的发声，这里记录每次 play()/speak() 的调用与结果：
 * 被自动播放策略拦截时 play() 返回的 Promise 会以 NotAllowedError 拒绝，
 * 据此可以判断"手势解锁"是否真的生效。
 */
export async function installAudioProbe(page: Page) {
  await page.addInitScript(() => {
    const log = { plays: [] as Array<{ src: string; blockedByPolicy: boolean }>, tts: [] as string[] };
    (window as unknown as { __audio: typeof log }).__audio = log;

    const origPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      const rec = { src: this.src || "", blockedByPolicy: false };
      log.plays.push(rec);
      const p = origPlay.call(this);
      if (p && typeof p.catch === "function") {
        p.catch((e: DOMException) => {
          if (e?.name === "NotAllowedError") rec.blockedByPolicy = true;
        });
      }
      return p;
    };

    // 记录朗读请求。不能改写 speechSynthesis.speak——WebKit 里该属性只读，
    // 赋值会被静默忽略，探针在 iOS 引擎上就成了摆设。
    // 改为拦截 SpeechSynthesisUtterance 构造函数：本代码库中构造即用于朗读，两个引擎都可靠。
    const OrigUtterance = window.SpeechSynthesisUtterance;
    if (typeof OrigUtterance === "function") {
      const Patched = function (this: unknown, text?: string) {
        log.tts.push(String(text ?? ""));
        return new OrigUtterance(text as string);
      } as unknown as typeof SpeechSynthesisUtterance;
      Patched.prototype = OrigUtterance.prototype;
      window.SpeechSynthesisUtterance = Patched;
    }
  });
}

export async function readAudioLog(page: Page): Promise<AudioLog> {
  return page.evaluate(() => (window as unknown as { __audio: AudioLog }).__audio);
}

/** 预置本地存档，避免每个用例都从零点开始点 */
export async function seedSave(page: Page, save: Record<string, unknown>) {
  await page.addInitScript(
    ([key, value]) => localStorage.setItem(key as string, value as string),
    ["raz-movers-save-v1", JSON.stringify(save)] as const
  );
}

/**
 * 一份"已学 40 词、今日未做任务"的存档，足以解锁测验与复习。
 *
 * 默认带 xpRate: 2（统一费率）。这些用例测的是同步与合并语义，
 * 不带这个标记的话存档一加载就会走一次历史补差，XP 被改写，
 * 断言的 XP 数字全部对不上——那是 migrate.test.ts 的职责，不该在这里混进来。
 */
export function savedProgress(over: Record<string, unknown> = {}) {
  const words: Record<string, unknown> = {};
  for (let i = 0; i < 40; i++) {
    words[`w${i}`] = { ivl: 1, due: "2026-01-01", mastered: false, lapses: 0, learned: "2026-07-25" };
  }
  return {
    version: 1,
    xpRate: 2,
    createdAt: "2026-07-23",
    xp: 500,
    wordCursor: 40,
    words,
    daily: {},
    badges: ["x"],
    agents: { unlocked: ["sage-01"], current: "sage-01" },
    stats: {
      masteredCount: 0, quizzesTaken: 3, quizQuestions: 30, quizCorrect: 24, perfectQuizzes: 1,
      readingsDone: 5, readingsPerfect: 1, bestCombo: 4, wordsLearned: 40, perfectDays: 2,
    },
    ...over,
  };
}

export const test = base.extend<{ cloud: CloudStub; dict: DictStub; audio: void }>({
  // 音频探针必须对所有用例生效：它靠 addInitScript 注入，
  // 若只在请求了 dict 的用例里安装，其余用例读 window.__audio 会直接拿到 undefined
  audio: [
    async ({ page }, use) => {
      await installAudioProbe(page);
      await use();
    },
    { auto: true },
  ],
  cloud: async ({ page }, use) => {
    const stub = new CloudStub();
    await stub.install(page);
    await use(stub);
  },
  dict: async ({ page }, use) => {
    const stub = new DictStub();
    await stub.install(page);
    await use(stub);
  },
});

export { expect } from "@playwright/test";
