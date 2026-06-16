import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      // Core user flows — must pass before deploy
      name: 'smoke',
      use: { ...devices['Desktop Chrome'] },
      testMatch: [
        'tests/auth.spec.js',
        'tests/robots.spec.js',
        'tests/battle.spec.js',
        'tests/admin.spec.js',
        'tests/sharing.spec.js',
      ],
    },
    {
      // Engine unit tests + secondary UI — run in parallel, non-blocking
      name: 'extended',
      use: { ...devices['Desktop Chrome'] },
      testMatch: [
        'tests/engine/**/*.spec.js',
        'tests/navigation.spec.js',
        'tests/editor.spec.js',
        'tests/leaderboard.spec.js',
        'tests/tournament.spec.js',
      ],
    },
  ],
  webServer: [
    {
      command: 'npm run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 10_000,
    },
    {
      command: 'node server.js',
      cwd: 'api',
      url: 'http://localhost:3001/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 15_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        JWT_SECRET: process.env.JWT_SECRET || 'dev-test-secret',
      },
    },
  ],
});
