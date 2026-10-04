import { expect, it } from 'vitest';
import { opensDrawer } from './detail-navigation';
it('intercepts only unmodified primary clicks, including keyboard activation', () => {
	const click = { button: 0, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, defaultPrevented: false };
	expect(opensDrawer(click)).toBe(true);
	for (const key of ['metaKey', 'ctrlKey', 'altKey', 'shiftKey', 'defaultPrevented'] as const) expect(opensDrawer({ ...click, [key]: true })).toBe(false);
	for (const button of [1, 2]) expect(opensDrawer({ ...click, button })).toBe(false);
});
