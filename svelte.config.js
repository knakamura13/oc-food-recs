import adapterNode from '@sveltejs/adapter-node';
import adapterStatic from '@sveltejs/adapter-static';

const isSitesBuild = process.env.SITES_BUILD === '1';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		adapter: isSitesBuild
			? adapterStatic({
					pages: 'dist/client',
					assets: 'dist/client',
					fallback: undefined,
					strict: false,
					precompress: true
				})
			: adapterNode({ precompress: true })
	}
};

export default config;
