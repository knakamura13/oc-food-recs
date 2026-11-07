import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5174",
    trace: "on-first-retry",
  },
  projects: [
    { name: "Mobile Chrome", use: { ...devices["Pixel 7"] } },
    // Headless WebKit rasterizes in software; at the iPhone's 3x scale a single re-render
    // takes 15+ seconds. Layout does not depend on pixel density, so test at 1x. Real-device
    // behavior is checked in the iOS Simulator.
    { name: "iPhone WebKit", use: { ...devices["iPhone 15"], deviceScaleFactor: 1 } },
    {
      name: "Desktop Chrome",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
  webServer: {
    command: "npm run dev -- --port 5174 --strictPort",
    url: "http://localhost:5174",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      ...process.env,
    },
  },
});
