/**
 * 发音链路：手势解锁、录音播放、超时回退。
 *
 * 用户实际反馈的故障是"听音选词题放不出声"。根因是手机浏览器禁止无用户手势的播放，
 * 而代码在 await 网络请求之后才调用 play()，手势授权早已失效；
 * 且查询发音地址的请求没有超时，网络一卡就永久停在加载中，连 TTS 回退都走不到。
 */
import { expect, readAudioLog, savedProgress, seedSave, test } from "./fixtures/app";

/** 静音解锁音频的特征串（44 字节 WAV 的 base64 前缀） */
const SILENT_WAV = "data:audio/wav";

test.describe("发音", () => {
  test.beforeEach(async ({ page }) => {
    await seedSave(page, savedProgress());
  });

  test("首个用户手势会解锁音频元素并预热语音合成", async ({ page, cloud }) => {
    cloud.rows = [];
    await page.goto("/");
    await expect(page.getByText("今日行动")).toBeVisible();

    // 解锁只应由真实手势触发，页面刚加载时不该有播放
    expect((await readAudioLog(page)).plays).toHaveLength(0);

    await page.getByText("今日行动").click();

    await expect
      .poll(async () => (await readAudioLog(page)).plays.filter((p) => p.src.startsWith(SILENT_WAV)).length)
      .toBeGreaterThan(0);

    const log = await readAudioLog(page);
    // 预热用的是空白文本、音量为 0 的朗读，不会被孩子听见
    expect(log.tts.some((t) => t.trim() === "")).toBe(true);
  });

  test("有真人录音时播放录音而不是机器朗读", async ({ page, cloud, dict }) => {
    cloud.rows = [];
    dict.audioUrl = "https://cdn.test/river-us.mp3";

    await page.goto("/");
    await page.getByText("今日行动").click(); // 先完成解锁
    await openStudy(page);

    await page.getByRole("button", { name: "播放发音", exact: true }).first().click();

    await expect
      .poll(async () => (await readAudioLog(page)).plays.some((p) => p.src.includes("cdn.test")), {
        timeout: 15_000,
      })
      .toBe(true);
  });

  test("发音接口挂起时按钮不会永久转圈，会在超时后回退机器朗读", async ({ page, cloud, dict }) => {
    cloud.rows = [];
    dict.hang = true; // 请求一直不返回

    await page.goto("/");
    await page.getByText("今日行动").click();
    await openStudy(page);

    const speaker = page.getByRole("button", { name: "播放发音", exact: true }).first();
    await speaker.click();

    // 2.5 秒超时 + 回退，给到 10 秒足够宽裕；关键是必须发生，而不是一直挂着
    await expect
      .poll(async () => (await readAudioLog(page)).tts.filter((t) => t.trim().length > 0).length, {
        timeout: 15_000,
      })
      .toBeGreaterThan(0);

    // 按钮恢复可用，没有卡在 disabled 的加载态
    await expect(speaker).toBeEnabled({ timeout: 15_000 });
  });

  test("发音接口报错时同样回退机器朗读", async ({ page, cloud, dict }) => {
    cloud.rows = [];
    dict.serverError = true;

    await page.goto("/");
    await page.getByText("今日行动").click();
    await openStudy(page);

    await page.getByRole("button", { name: "播放发音", exact: true }).first().click();

    await expect
      .poll(async () => (await readAudioLog(page)).tts.filter((t) => t.trim().length > 0).length, {
        timeout: 15_000,
      })
      .toBeGreaterThan(0);
  });

  test("该词无录音时直接用机器朗读，不报错", async ({ page, cloud, dict }) => {
    cloud.rows = [];
    dict.audioUrl = null; // 接口 200 但没有录音字段

    await page.goto("/");
    await page.getByText("今日行动").click();
    await openStudy(page);

    await page.getByRole("button", { name: "播放发音", exact: true }).first().click();

    await expect
      .poll(async () => (await readAudioLog(page)).tts.filter((t) => t.trim().length > 0).length, {
        timeout: 15_000,
      })
      .toBeGreaterThan(0);
  });
});

/** 进入新词学习页——那里有单词卡与喇叭按钮 */
async function openStudy(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: /开始行动/ }).click();
  await expect(page.getByRole("button", { name: "播放发音", exact: true }).first()).toBeVisible({ timeout: 15_000 });
}

test.describe("发音完全不可用时的兜底", () => {
  test.beforeEach(async ({ page }) => {
    await seedSave(page, savedProgress());
    // 模拟"系统一个英文语音都没有"的设备。
    // 必须整体替换 window.speechSynthesis：改写其上的单个方法在 WebKit 上不生效，
    // 该属性每次访问返回的是新的包装对象，补丁打在旧对象上，应用读到的仍是原实现。
    await page.addInitScript(() => {
      const dead = {
        getVoices: () => [],
        speak: () => {},
        cancel: () => {},
        pause: () => {},
        resume: () => {},
        speaking: false,
        pending: false,
        paused: false,
        onvoiceschanged: null,
        addEventListener: () => {},
        removeEventListener: () => {},
      };
      Object.defineProperty(window, "speechSynthesis", { configurable: true, get: () => dead });
    });
  });

  test("录音与朗读都失败时，喇叭给出可见反馈而不是假装播完", async ({ page, cloud, dict }) => {
    cloud.rows = [];
    dict.serverError = true; // 拿不到录音

    await page.goto("/");
    await page.getByText("今日行动").click();
    await page.getByRole("button", { name: /开始行动/ }).click();

    const speaker = page.getByRole("button", { name: "播放发音", exact: true }).first();
    await speaker.click();

    await expect(speaker).toHaveAttribute("title", /发不出声音/, { timeout: 15_000 });
    await expect(speaker).toBeEnabled();
  });

  test("听音题放不出声时告知孩子题目单词，避免只能瞎猜", async ({ page, cloud, dict }) => {
    cloud.rows = [];
    dict.serverError = true;

    await page.goto("/");
    await page.getByRole("button", { name: /测验/ }).last().click();
    await page.getByRole("button", { name: /开始|再来一局/ }).first().click();

    // 题型顺序固定为 en2zh → zh2en → listen → zh2en → spell，
    // 因此答完前两题必定进入听音题，无需靠随机碰运气
    await answerOption(page);
    await answerOption(page);

    await expect(page.getByText("这台设备暂时发不出声音")).toBeVisible({ timeout: 15_000 });
    // 题目单词要给出来，否则这道题孩子只能瞎猜
    await expect(page.getByText(/本题的单词是/)).toBeVisible();
  });
});

/** 作答当前选择题：选项按钮以 A/B/C/D 开头 */
async function answerOption(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: /^[ABCD] / }).first().click();
  await page.waitForTimeout(1400); // 等反馈动画与自动进入下一题
}
