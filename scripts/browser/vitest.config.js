import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: { include: ['scripts/browser/*.test.js'], environment: 'jsdom' }
});
