import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import SearchBar from './SearchBar.svelte';
import { appState } from '$lib/restaurants/stores.svelte';
import { makeRestaurant, resetAppState } from '$lib/restaurants/test-utils';

const restaurants = [
	makeRestaurant({ name: 'Taco Palace', slug: 'taco-palace', cuisine: 'Mexican', location: 'Santa Ana' }),
	makeRestaurant({ name: 'Sushi Zen', slug: 'sushi-zen', cuisine: 'Japanese', location: 'Irvine' }),
	makeRestaurant({ name: 'Burger Barn', slug: 'burger-barn', cuisine: 'Burgers', location: 'Fullerton' })
];
const cuisineNames = ['Mexican', 'Japanese', 'Burgers'];
const cityNames = ['Santa Ana', 'Irvine', 'Fullerton'];

describe('SearchBar', () => {
	beforeEach(() => resetAppState());

	it('shows fuzzy search results as the user types', async () => {
		const user = userEvent.setup();
		render(SearchBar, { restaurants, cuisineNames, cityNames });
		const input = screen.getByRole('combobox', { name: /search restaurants, cuisines, or cities/i });
		await user.click(input);
		await user.type(input, 'taco');
		await waitFor(() => {
			expect(screen.getByRole('listbox', { name: /search results/i })).toBeInTheDocument();
		});
		expect(screen.getByText('Taco Palace')).toBeInTheDocument();
		expect(screen.queryByText('Sushi Zen')).not.toBeInTheDocument();
	});

	it('applies a cuisine filter when Enter matches a synonym', async () => {
		const user = userEvent.setup();
		render(SearchBar, { restaurants, cuisineNames, cityNames });
		const input = screen.getByRole('combobox', { name: /search restaurants, cuisines, or cities/i });
		await user.type(input, 'tacos');
		await user.keyboard('{Enter}');
		expect(appState.activeCuisines).toEqual(['Mexican']);
		expect(appState.searchQuery).toBe('');
	});

	it('selects a restaurant when there is exactly one fuzzy match', async () => {
		const user = userEvent.setup();
		render(SearchBar, { restaurants, cuisineNames, cityNames });
		const input = screen.getByRole('combobox', { name: /search restaurants, cuisines, or cities/i });
		await user.click(input);
		await user.type(input, 'Taco Palace');
		await user.keyboard('{Enter}');
		expect(appState.searchQuery).toBe('Taco Palace');
		expect(appState.selectedRestaurantSlug).toBe('taco-palace');
		expect(appState.listScrollTarget).toBe('taco-palace');
	});

	it('clears the search when the clear button is clicked', async () => {
		const user = userEvent.setup();
		appState.searchQuery = 'taco';
		render(SearchBar, { restaurants, cuisineNames, cityNames });
		await user.click(screen.getByRole('button', { name: /clear search/i }));
		expect(appState.searchQuery).toBe('');
		expect(screen.queryByRole('button', { name: /clear search/i })).not.toBeInTheDocument();
	});
});
