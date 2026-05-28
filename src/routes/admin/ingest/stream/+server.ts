import type { RequestHandler } from './$types';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import { error } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url }) => {
	const targetUrl = url.searchParams.get('url');
	if (!targetUrl || !/^https:\/\/(www\.)?reddit\.com\//.test(targetUrl)) {
		error(400, 'Missing or invalid Reddit URL');
	}

	let proc: ChildProcessWithoutNullStreams | null = null;

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			const encoder = new TextEncoder();
			let closed = false;
			const send = (event: object) => {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
				} catch {
					// controller already closed
				}
			};
			const closeOnce = () => {
				if (closed) return;
				closed = true;
				try {
					controller.close();
				} catch {
					// already closed
				}
			};

			// Resolve repo root from current working directory (where the Node
			// server was started — this is always the project root in our setup).
			const repoRoot = path.resolve(process.cwd());
			proc = spawn(
				'python3',
				['scripts/reddit_pipeline.py', 'ingest', '--url', targetUrl],
				{
					cwd: repoRoot,
					env: process.env
				}
			);

			let stdoutBuffer = '';
			proc.stdout.on('data', (chunk: Buffer) => {
				stdoutBuffer += chunk.toString('utf8');
				const lines = stdoutBuffer.split('\n');
				// Keep any trailing partial line in the buffer until we see a newline.
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
				// Flush any trailing buffered partial line on close.
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
			// EventSource was closed by the client — terminate the subprocess so we
			// don't leak a long-running Python process.
			if (proc && proc.exitCode === null && !proc.killed) {
				proc.kill('SIGTERM');
			}
		}
	});

	return new Response(stream, {
		headers: {
			'content-type': 'text/event-stream',
			'cache-control': 'no-store',
			connection: 'keep-alive',
			'x-accel-buffering': 'no'
		}
	});
};
