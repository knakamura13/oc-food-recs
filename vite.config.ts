import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		fs: {
			// Allow serving from the parent repo's node_modules when running in a git worktree
			allow: [resolve(__dirname), resolve(__dirname, '../../..')]
		}
	}
});
