import { configDefaults, defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    environment: 'happy-dom',
    // Claude Code worktrees hold other checkouts whose tests would run against this one's code.
    exclude: [...configDefaults.exclude, '.claude/**'],
  },
});
