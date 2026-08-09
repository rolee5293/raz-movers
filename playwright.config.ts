import { defineConfig, devices } from "@playwright/test";

/**
 * 学习端 E2E 配置。
 *
 * 所有用例都必须通过 tests/e2e/fixtures/app.ts 拦截 Supabase 与发音 API：
 * 应用在任何存档变化后都会自动上传，直连线上会把测试数据写进孩子的真实存档。
 *
 * 设备矩阵按真实使用场景取：孩子用 iPhone 与安卓手机，桌面仅作回归基线。
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL: "http://localhost:5199",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  projects: [
    { name: "mobile-safari", use: { ...devices["iPhone 13"] } },
    { name: "mobile-chrome", use: { ...devices["Pixel 5"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run dev -- --port 5199 --strictPort",
    url: "http://localhost:5199",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
