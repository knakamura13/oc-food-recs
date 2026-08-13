import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const layoutSource = readFileSync(join(process.cwd(), 'src/routes/+layout.svelte'), 'utf8');

describe('layout toast close targets', () => {
	it('raises the Sonner close control above the 24px floor', () => {
		expect(layoutSource).toContain('closeButton');
		expect(layoutSource).toMatch(
			/\[data-close-button\]\) \{[\s\S]*width: 24px;[\s\S]*height: 24px;[\s\S]*min-width: 24px;[\s\S]*min-height: 24px;/
		);
	});

	it('uses a 44px close hit on phones so dismiss does not sit on a 20px corner', () => {
		const phoneMedia = layoutSource.lastIndexOf('@media (max-width: 1023px)');
		expect(phoneMedia).toBeGreaterThan(-1);
		const block = layoutSource.slice(phoneMedia);
		expect(block).toMatch(
			/\[data-close-button\]\) \{[\s\S]*width: 44px;[\s\S]*height: 44px;[\s\S]*min-width: 44px;[\s\S]*min-height: 44px;/
		);
		expect(block).toContain('padding-right: 3rem');
	});
});
