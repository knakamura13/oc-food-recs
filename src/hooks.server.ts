import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';
import type { Handle, HandleServerError } from '@sveltejs/kit';
import { timingSafeEqual } from 'node:crypto';

function safeCompare(a: string, b: string): boolean {
	const bufA = Buffer.from(a);
	const bufB = Buffer.from(b);
	if (bufA.length !== bufB.length) {
		return false;
	}
	return timingSafeEqual(bufA, bufB);
}

// Self-hosted fonts live in src/lib/assets/fonts so Vite emits them as content-hashed files under
// /_app/immutable/, which adapter-node serves with `max-age=31536000, immutable`. Files in
// static/ only get ETag revalidation. app.html keeps stable `/fonts/<name>.woff2` placeholders;
// they are rewritten to the hashed URLs below.
const fontUrls = new Map(
	Object.entries(
		import.meta.glob<string>('$lib/assets/fonts/*.woff2', {
			eager: true,
			query: '?url',
			import: 'default'
		})
	).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1), url])
);

export function rewriteFontUrls(html: string): string {
	return html.replace(/\/fonts\/([\w-]+\.woff2)/g, (match, file: string) => fontUrls.get(file) ?? match);
}

const NO_STORE = 'private, no-store';

export const handle: Handle = async ({ event, resolve }) => {
	const pathname = event.url.pathname;
	const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/');

	if (isAdminRoute && !dev) {
		const adminPassword = env.ADMIN_PASSWORD;
		if (!adminPassword) {
			return new Response('Not Found', { status: 404 });
		}

		const authHeader = event.request.headers.get('authorization') ?? '';
		const expectedAuth = `Basic ${Buffer.from(`admin:${adminPassword}`).toString('base64')}`;

		if (!safeCompare(authHeader, expectedAuth)) {
			return new Response('Authentication required', {
				status: 401,
				headers: {
					'cache-control': NO_STORE,
					'www-authenticate': 'Basic realm="admin", charset="UTF-8"'
				}
			});
		}
	}

	const response = await resolve(event, { transformPageChunk: ({ html }) => rewriteFontUrls(html) });

	// Never let a shared cache (Railway CDN) keep admin pages or anything but GET/HEAD.
	if (isAdminRoute || (event.request.method !== 'GET' && event.request.method !== 'HEAD')) {
		response.headers.set('cache-control', NO_STORE);
	}

	return response;
};

// Unexpected errors, including rejected streamed promises on `/`, which arrive after
// a 200 has already been sent. Log one structured line; the client gets SvelteKit's
// generic message, never the error itself. 404s are routine and not logged.
export const handleError: HandleServerError = ({ error, event, status, message }) => {
	if (status !== 404) {
		const err = error instanceof Error ? error : new Error(String(error));
		console.error(
			JSON.stringify({
				level: 'error',
				source: 'sveltekit',
				status,
				method: event.request.method,
				path: event.url.pathname,
				route: event.route.id,
				code: (err as Error & { code?: string }).code,
				message: err.message,
				stack: err.stack
			})
		);
	}
	return { message };
};
