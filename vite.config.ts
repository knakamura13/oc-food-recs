/// <reference types="vitest/config" />
import { sveltekit } from '@sveltejs/kit/vite';
import { svelteTesting } from '@testing-library/svelte/vite';
import { defineConfig } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	plugins: [sveltekit(), svelteTesting()],
	server: {
		fs: {
			allow: [resolve(__dirname), resolve(__dirname, '../../..')]
		}
	},
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}'],
		exclude: ['tests/**', 'node_modules/**'],
		environment: 'jsdom',
		setupFiles: ['./vitest-setup.ts']
	}
});
