/**
 * 学习主流程：首页任务、新词学习、测验（含听音题自动发音）、页面切换。
 */
import { expect, readAudioLog, savedProgress, seedSave, test } from "./fixtures/app";

const SILENT_WAV = "data:audio/wav";

test.describe("学习流程", () => {
  test.beforeEach(async ({ cloud }) => {
    cloud.rows = []; // 每个用例从干净云端开始，避免相互影响
  });

  test("首页展示四项每日任务与当前进度", async ({ page }) => {
    await seedSave(page, savedProgress({ xp: 500 }));
    await page.goto("/");

    await expect(page.getByText("今日行动")).toBeVisible();
    for (const task of ["新词学习", "战术复习", "靶场测验", "阅读理解"]) {
      await expect(page.getByText(task).first()).toBeVisible();
    }
    await expect(page.getByText("XP 500")).toBeVisible();
  });

  test("完成一轮新词学习后任务标记完成且 XP 增加", async ({ page }) => {
    await seedSave(page, savedProgress({ xp: 500 }));
    await page.goto("/");
    await page.getByRole("button", { name: /开始行动/ }).click();

    // 连续给 10 个新词评分（每日新词任务固定 10 个）
    for (let i = 0; i < 10; i++) {
      const btn = page.getByRole("button", { name: /认识了/ });
      if ((await btn.count()) === 0) break;
      await btn.first().click();
      await page.waitForTimeout(350);
    }

    // 评完进入结算页，XP 要点确认才入账
    await expect(page.getByText("新词学习完成")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /确认/ }).click();

    // 首页 XP 应已上涨
    await expect.poll(async () => {
      const t = await page.evaluate(() => document.body.innerText);
      const m = /XP (\d+)/.exec(t);
      return m ? Number(m[1]) : 0;
    }, { timeout: 15_000 }).toBeGreaterThan(500);
  });

  test("底部导航可在五个页面间切换", async ({ page }) => {
    await seedSave(page, savedProgress());
    await page.goto("/");

    for (const [tab, marker] of [
      ["测验", /靶场测验|RANGE TRIAL/],
      ["阅读", /阅读|简报/],
      ["战绩", /战绩|已掌握|勋章/],
      ["基地", /今日行动/],
    ] as const) {
      await page.getByRole("button", { name: new RegExp(tab) }).last().click();
      await expect(page.getByText(marker).first()).toBeVisible({ timeout: 10_000 });
    }
  });

  test("听音选词题会自动发音，孩子无需手动点喇叭", async ({ page, dict }) => {
    dict.audioUrl = "https://cdn.test/word-us.mp3";
    await seedSave(page, savedProgress());
    await page.goto("/");

    await page.getByRole("button", { name: /测验/ }).last().click();
    await page.getByRole("button", { name: /开始|再来一局/ }).first().click();

    // 出现听音题前可能先是其他题型，逐题作答直到遇到听音题
    for (let i = 0; i < 6; i++) {
      const isListen = await page.getByText("听无线电录音").isVisible().catch(() => false);
      if (isListen) break;
      const opt = page.locator("button").filter({ hasNotText: "播放发音" });
      await opt.nth(3).click({ timeout: 5_000 }).catch(() => {});
      await page.waitForTimeout(900);
    }

    // 只要走到听音题，就应当自动播放（解锁在点"开始"时已完成）
    const listenSeen = await page.getByText("听无线电录音").isVisible().catch(() => false);
    test.skip(!listenSeen, "本轮随机抽题未包含听音题");

    await expect
      .poll(async () => {
        const log = await readAudioLog(page);
        return log.plays.some((p) => !p.src.startsWith(SILENT_WAV)) || log.tts.some((t) => t.trim().length > 0);
      }, { timeout: 15_000 })
      .toBe(true);
  });

  test("测验开始按钮会在真实点击中解锁音频", async ({ page }) => {
    await seedSave(page, savedProgress());
    await page.goto("/");

    await page.getByRole("button", { name: /测验/ }).last().click();
    await page.getByRole("button", { name: /开始|再来一局/ }).first().click();

    await expect
      .poll(async () => (await readAudioLog(page)).plays.filter((p) => p.src.startsWith(SILENT_WAV)).length, {
        timeout: 10_000,
      })
      .toBeGreaterThan(0);
  });
});
