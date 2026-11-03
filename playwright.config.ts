import { defineConfig, devices } from '@playwright/test';
import { CAMERA_FILE } from './tests/e2e/camera-constants';

// End-to-end tests run against the production build (`vite preview`), so the
// service worker and CSP behave as on the real device.
export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173/',
    ...devices['Pixel 7'],
    screenshot: 'only-on-failure',
    // A fake camera that shows a still picture of a fake label (see fake-camera.ts).
    permissions: ['camera'],
    launchOptions: {
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${CAMERA_FILE}`],
    },
  },
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
