import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		fs: {
			// Allow serving from the parent repo's node_modules when running in a git worktree
			allow: [path.resolve(__dirname), path.resolve(__dirname, '../../..')]
		}
	}
});
