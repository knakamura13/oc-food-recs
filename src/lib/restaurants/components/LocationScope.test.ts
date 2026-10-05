import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import LocationScope from './LocationScope.svelte';

const locations = [{ city: 'North City', street: '1 Fictional Way' }, { city: 'South City', street: '2 Synthetic St' }];
describe('multiple-location presentation', () => {
	it('names both locations without creating branch counts and exposes distinct keyboard links', async () => {
		render(LocationScope, { scope: 'multiple_locations', locations });
		expect(screen.getByText('Multiple locations — North City and South City')).toBeInTheDocument();
		expect(screen.getByText(/counts describe shared evidence/)).toBeInTheDocument();
		const links = screen.getAllByRole('link');
		expect(links).toHaveLength(2);
		expect(new URL(links[0].getAttribute('href')!).searchParams.get('query')).toBe('1 Fictional Way, North City, CA');
		expect(new URL(links[1].getAttribute('href')!).searchParams.get('query')).toBe('2 Synthetic St, South City, CA');
		await userEvent.setup().tab(); expect(links[0]).toHaveFocus();
	});
	it('uses a compact noninteractive label inside the result link', () => {
		render(LocationScope, { scope: 'multiple_locations', locations, compact: true });
		expect(screen.getByText(/Multiple locations/)).toBeInTheDocument();
		expect(screen.queryByRole('link')).not.toBeInTheDocument();
	});
	it('does not change ordinary locations', () => {
		const { container } = render(LocationScope, { locations });
		expect(container.textContent?.trim()).toBe('');
	});
});
