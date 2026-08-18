/**
 * 云同步：设备隔离、多设备合并、启动门闩、离线降级。
 *
 * 这些用例守护的是"孩子的进度会不会被静默吞掉"。历史上出过两次事故：
 * 多设备共用一行导致互相覆盖；启动时本地旧存档抢在下载完成前把云端冲掉。
 */
import { expect, savedProgress, seedSave, test } from "./fixtures/app";

const OLD = "2026-07-23T06:38:50.698409+00:00";

test.describe("云同步", () => {
  test("上传只写本设备专属行，历史行原样保留", async ({ page, cloud }) => {
    const legacy = savedProgress({ xp: 500 });
    cloud.rows = [{ app: "raz", data: legacy, updated_at: OLD }];

    await page.goto("/");
    await expect(page.getByText("今日行动")).toBeVisible();
    await expect.poll(() => cloud.uploads.length, { timeout: 15_000 }).toBeGreaterThan(0);

    // 行标识形如 raz#<设备ID>，绝不是历史行 "raz"
    expect(cloud.lastRowKey()).toMatch(/^raz#.+/);
    expect(cloud.lastRowKey()).not.toBe("raz");

    // 历史行未被改写
    const stillLegacy = cloud.rows.find((r) => r.app === "raz");
    expect(stillLegacy?.updated_at).toBe(OLD);
    expect((stillLegacy?.data as { xp: number }).xp).toBe(500);
  });

  test("同一设备重复上传复用同一行，不会每次新建", async ({ page, cloud }) => {
    cloud.rows = [];
    await page.goto("/");
    await expect.poll(() => cloud.uploads.length, { timeout: 15_000 }).toBeGreaterThan(0);
    const first = cloud.lastRowKey();

    await page.reload();
    await expect.poll(() => cloud.uploads.length, { timeout: 15_000 }).toBeGreaterThan(1);

    expect(cloud.lastRowKey()).toBe(first);
    expect(cloud.rows.filter((r) => r.app.startsWith("raz#"))).toHaveLength(1);
  });

  test("多设备存档合并后取进度最快的一方，累计量不翻倍", async ({ page, cloud }) => {
    const devA = savedProgress({ xp: 800, wordCursor: 110 });
    const devB = savedProgress({ xp: 500, wordCursor: 60 });
    (devA as { stats: Record<string, number> }).stats.quizQuestions = 650;
    (devB as { stats: Record<string, number> }).stats.quizQuestions = 400;
    cloud.rows = [
      { app: "raz#deviceA", data: devA, updated_at: "2026-08-08T10:00:00+00:00" },
      { app: "raz#deviceB", data: devB, updated_at: "2026-08-08T11:00:00+00:00" },
    ];

    await page.goto("/");
    // XP 取最大值 800，而非相加的 1300
    await expect(page.getByText("XP 800")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("XP 1300")).toHaveCount(0);

    await expect.poll(() => cloud.uploads.length, { timeout: 15_000 }).toBeGreaterThan(0);
    const up = cloud.uploads[cloud.uploads.length - 1].data as Record<string, number> & {
      stats: Record<string, number>;
    };
    expect(up.xp).toBe(800);
    expect(up.wordCursor).toBe(110);
    expect(up.stats.quizQuestions).toBe(650);
  });

  test("本机已有进度时与云端取并，本地进度不被云端覆盖", async ({ page, cloud }) => {
    await seedSave(page, savedProgress({ xp: 900, wordCursor: 130 }));
    cloud.rows = [{ app: "raz#other", data: savedProgress({ xp: 400, wordCursor: 50 }), updated_at: OLD }];

    await page.goto("/");
    await expect(page.getByText("XP 900")).toBeVisible({ timeout: 15_000 });

    await expect.poll(() => cloud.uploads.length, { timeout: 15_000 }).toBeGreaterThan(0);
    const up = cloud.uploads[cloud.uploads.length - 1].data as Record<string, number>;
    expect(up.xp).toBe(900);
    expect(up.wordCursor).toBe(130);
  });

  test("首次下载未返回前不上传，避免本地旧存档冲掉云端", async ({ page, cloud }) => {
    // 下载耗时取 4 秒：已越过 3 秒的上传防抖窗口（修复前此刻本地空存档已把云端覆盖），
    // 又短于应用自身 6 秒的下载超时，确保验证的是门闩而不是超时降级路径
    cloud.downloadDelayMs = 4_000;
    cloud.rows = [{ app: "raz#rich", data: savedProgress({ xp: 5000, wordCursor: 200 }), updated_at: OLD }];

    await page.goto("/");
    await page.waitForTimeout(4_000); // 已过防抖窗口，但下载仍未返回
    expect(cloud.uploads).toHaveLength(0);

    // 下载返回后才允许上传，且上传的是合并后的高进度
    await expect.poll(() => cloud.uploads.length, { timeout: 20_000 }).toBeGreaterThan(0);
    expect((cloud.uploads[cloud.uploads.length - 1].data as { xp: number }).xp).toBe(5000);
  });

  test("旧费率存档打开即补差，且补差结果会同步到云端", async ({ page, cloud }) => {
    // 不带 xpRate 的存档 = 2026-08-18 之前按旧费率攒的分
    const legacy = savedProgress({ xp: 500 });
    delete (legacy as Record<string, unknown>).xpRate;
    await seedSave(page, legacy);

    await page.goto("/");
    // 24 题答对 + 1 次满分 + 5 篇阅读(1 篇全对) + 2 个完美日，按统一费率重算为 980
    await expect(page.getByText("XP 980")).toBeVisible({ timeout: 15_000 });

    // 补差结果必须上传，否则换台设备又变回旧分数
    await expect.poll(() => cloud.uploads.length, { timeout: 15_000 }).toBeGreaterThan(0);
    const last = cloud.uploads[cloud.uploads.length - 1].data as { xp: number; xpRate: number };
    expect(last.xp).toBe(980);
    expect(last.xpRate).toBe(2);
  });

  test("云端不可用时应用照常可用，不阻塞学习", async ({ page, cloud }) => {
    cloud.offline = true;
    await seedSave(page, savedProgress({ xp: 700 }));

    await page.goto("/");
    await expect(page.getByText("今日行动")).toBeVisible();
    await expect(page.getByText("XP 700")).toBeVisible();
    await expect(page.getByRole("button", { name: /开始行动/ })).toBeEnabled();
  });

  test("下载超时也只写本设备行，不会波及其他设备的存档", async ({ page, cloud }) => {
    // 延迟超过应用 6 秒的下载超时，走超时降级路径
    cloud.downloadDelayMs = 8_000;
    cloud.rows = [{ app: "raz#other", data: savedProgress({ xp: 5000 }), updated_at: OLD }];

    await page.goto("/");
    await expect.poll(() => cloud.uploads.length, { timeout: 25_000 }).toBeGreaterThan(0);

    // 超时后本地存档照常上传，但落在自己那一行；另一台设备的高进度分毫未动
    expect(cloud.lastRowKey()).toMatch(/^raz#.+/);
    expect(cloud.lastRowKey()).not.toBe("raz#other");
    expect((cloud.rows.find((r) => r.app === "raz#other")?.data as { xp: number }).xp).toBe(5000);
  });

  test("上传带 updated_at，否则家长端会一直误报未同步", async ({ page, cloud }) => {
    await page.goto("/");
    await expect.poll(() => cloud.uploads.length, { timeout: 15_000 }).toBeGreaterThan(0);

    const stamp = cloud.uploads[cloud.uploads.length - 1].updated_at;
    expect(stamp).toBeTruthy();
    expect(Number.isNaN(Date.parse(stamp))).toBe(false);
  });
});
