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
