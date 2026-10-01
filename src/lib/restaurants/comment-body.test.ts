import { describe, expect, it } from 'vitest';
import { stripMarkdownForSnippet, tokenizeCommentBody } from './comment-body';

describe('tokenizeCommentBody', () => {
	it('turns markdown links, bold text and bare URLs into tokens', () => {
		const [p] = tokenizeCommentBody(
			'See [map](https://maps.apple.com/?q=a%20b) **great** food https://www.reddit.com/r/x'
		);
		expect(p).toEqual([
			{ type: 'text', text: 'See ' },
			{ type: 'link', text: 'map', href: 'https://maps.apple.com/?q=a%20b' },
			{ type: 'text', text: ' ' },
			{ type: 'bold', text: 'great' },
			{ type: 'text', text: ' food ' },
			{ type: 'link', text: 'reddit.com', href: 'https://www.reddit.com/r/x' }
		]);
	});

	it('splits paragraphs on blank lines and keeps single newlines as breaks', () => {
		const paras = tokenizeCommentBody('one\ntwo\n\nthree');
		expect(paras).toHaveLength(2);
		expect(paras[0].map((t) => t.type)).toEqual(['text', 'break', 'text']);
	});

	it('renders bullets as a bullet glyph', () => {
		const [p] = tokenizeCommentBody('- tacos');
		expect(p).toEqual([
			{ type: 'text', text: '• ' },
			{ type: 'text', text: 'tacos' }
		]);
	});

	it('never links non-http schemes', () => {
		const tokens = tokenizeCommentBody('[x](javascript:alert(1))').flat();
		expect(tokens.some((t) => t.type === 'link')).toBe(false);
	});
});

describe('stripMarkdownForSnippet', () => {
	it('keeps link labels and drops URLs and markers', () => {
		expect(
			stripMarkdownForSnippet('**Try** [Apple Maps](https://maps.apple.com/?q=%E2%80%A6) now https://x.com/a')
		).toBe('Try Apple Maps now ');
	});
});
