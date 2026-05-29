import type { RequestHandler } from './$types';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { error } from '@sveltejs/kit';

/**
 * Accepts a multipart upload of a saved Reddit thread HTML file, writes it to a
 * temp path, runs `reddit_pipeline.py ingest --html <file> --no-archive`, and
 * streams the pipeline's JSON-lines progress events back as newline-delimited
 * JSON. We pass --no-archive because this route owns the temp file's lifecycle
 * (it cleans up its own tmp dir) and the upload has no canonical
 * {subreddit}-{thread_id}.html name to archive under.
 */
export const POST: RequestHandler = async ({ request }) => {
	const formData = await request.formData();
	const file = formData.get('html');
	if (!(file instanceof File) || file.size === 0) {
		error(400, 'Missing HTML file upload (field "html")');
	}

	// Persist the upload so the Python subprocess can read it from disk.
	const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'oc-ingest-'));
	const tmpFile = path.join(tmpDir, 'thread.html');
	await writeFile(tmpFile, Buffer.from(await file.arrayBuffer()));
	const cleanup = () => {
		void rm(tmpDir, { recursive: true, force: true });
	};

	let proc: ChildProcessWithoutNullStreams | null = null;

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			const encoder = new TextEncoder();
			let closed = false;
			const send = (event: object) => {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
				} catch {
					// controller already closed
				}
			};
			const closeOnce = () => {
				if (closed) return;
				closed = true;
				cleanup();
				try {
					controller.close();
				} catch {
					// already closed
				}
			};

			// The Node server is always started from the project root in our setup.
			const repoRoot = path.resolve(process.cwd());
			proc = spawn(
				'python3',
				['scripts/reddit_pipeline.py', 'ingest', '--html', tmpFile, '--no-archive'],
				{
					cwd: repoRoot,
					env: process.env
				}
			);

			let stdoutBuffer = '';
			proc.stdout.on('data', (chunk: Buffer) => {
				stdoutBuffer += chunk.toString('utf8');
				const lines = stdoutBuffer.split('\n');
				stdoutBuffer = lines.pop() ?? '';
				for (const line of lines) {
					const trimmed = line.trim();
					if (!trimmed) continue;
					try {
						send(JSON.parse(trimmed));
					} catch {
						send({ stage: 'log', message: trimmed });
					}
				}
			});

			let stderrBuffer = '';
			proc.stderr.on('data', (chunk: Buffer) => {
				stderrBuffer += chunk.toString('utf8');
				const lines = stderrBuffer.split('\n');
				stderrBuffer = lines.pop() ?? '';
				for (const line of lines) {
					if (!line.trim()) continue;
					send({ stage: 'log', level: 'stderr', message: line });
				}
			});

			proc.on('error', (err: Error) => {
				send({ stage: 'error', message: err.message });
				closeOnce();
			});

			proc.on('close', (code: number | null) => {
				if (stdoutBuffer.trim()) {
					const tail = stdoutBuffer.trim();
					try {
						send(JSON.parse(tail));
					} catch {
						send({ stage: 'log', message: tail });
					}
					stdoutBuffer = '';
				}
				if (stderrBuffer.trim()) {
					send({ stage: 'log', level: 'stderr', message: stderrBuffer.trim() });
					stderrBuffer = '';
				}
				if (code !== 0 && code !== null) {
					send({ stage: 'error', message: `Pipeline exited with code ${code}` });
				}
				closeOnce();
			});
		},

		cancel() {
			// Client aborted — terminate the subprocess and clean up the temp file.
			if (proc && proc.exitCode === null && !proc.killed) {
				proc.kill('SIGTERM');
			}
			cleanup();
		}
	});

	return new Response(stream, {
		headers: {
			'content-type': 'application/x-ndjson',
			'cache-control': 'no-store',
			'x-accel-buffering': 'no'
		}
	});
};
