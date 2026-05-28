import type { Restaurant, SortKey } from './types';

export const appState = $state({
	searchQuery: '',
	activeCuisines: [] as string[],
	activeCities: [] as string[],
	sortKey: 'score' as SortKey,
	sortDirection: 'desc' as 'asc' | 'desc',
	selectedRestaurantSlug: null as string | null,
	mapTarget: null as Restaurant | null,
	listScrollTarget: null as Restaurant | null,
	fitBoundsTarget: null as Restaurant[] | null
});

export function slugify(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-|-$)/g, '');
}

// Cuisine consolidation: map raw values to canonical categories
const CUISINE_MAP: Record<string, string> = {
	// Case variants
	burgers: 'Burgers',
	pizza: 'Pizza',
	sandwiches: 'Sandwiches',
	'ice cream': 'Ice Cream',
	donuts: 'Donuts',
	deli: 'Deli',

	// Merge similar
	KBBQ: 'Korean',
	'Korean BBQ': 'Korean',
	'Lao/Thai': 'Thai',
	Laotian: 'Thai',
	'British Indian': 'Indian',
	'Indian American': 'Indian',
	'Middle Eastern/Indian': 'Indian',
	Himalayan: 'Indian',
	'Italian-Argentinian': 'Italian',
	'Italian Fusion': 'Italian',
	'Chinese & Vietnamese': 'Vietnamese',
	'Singaporean/Malaysian': 'Southeast Asian',
	'Malaysian/Singaporean': 'Southeast Asian',
	Singaporean: 'Southeast Asian',
	Burmese: 'Southeast Asian',
	Pho: 'Vietnamese',
	Ramen: 'Japanese',
	Sushi: 'Japanese',
	Okinawan: 'Japanese',
	'Deli/Bakery': 'Bakery',
	'NY-style Jewish deli': 'Deli',
	Sandwich: 'Sandwiches',
	'Salvadoran/Donuts': 'Latin American',
	Pupusas: 'Latin American',
	Latino: 'Latin American',
	Peruvian: 'Latin American',
	Argentinian: 'Latin American',
	'American BBQ': 'BBQ',
	'Fried Chicken': 'American',
	Californian: 'American',
	'Breakfast/Brunch': 'Breakfast',
	'Breakfast/Diner': 'Breakfast',
	Diner: 'Breakfast',
	Tofu: 'Vegan',
	Dessert: 'Dessert',
	'Ice Cream': 'Dessert',
	Donuts: 'Dessert',
	Coffee: 'Cafe',
	'Wine Bistro': 'Bar',
	Stillhouse: 'Bar',
	Poke: 'Japanese',
	Asian: 'Asian',
	Danish: 'European',
	British: 'European',
	French: 'European',
	German: 'European',
	Polynesian: 'Other',
	Steakhouse: 'American',
	Seafood: 'Seafood'
};

export function normalizeCuisine(cuisine: string | null): string {
	if (!cuisine) return 'Unknown';
	if (CUISINE_MAP[cuisine]) return CUISINE_MAP[cuisine];
	// Title case the first letter
	return cuisine.charAt(0).toUpperCase() + cuisine.slice(1);
}

// City normalization: handle multi-city entries
const CITY_NORMALIZE: Record<string, string> = {
	'Anaheim Hills': 'Anaheim',
	'Anaheim, CA': 'Anaheim',
	'Old Town Tustin': 'Tustin',
	'Santa Ana/Tustin': 'Santa Ana',
	'Sunset Beach/Huntington Beach': 'Huntington Beach',
	'Sunset Beach': 'Huntington Beach',
	'Seal Beach or Los Alamitos': 'Los Alamitos',
	'Garden Grove, Buena Park': 'Garden Grove',
	'Dana Point / San Juan Capistrano': 'San Juan Capistrano',
	'Lake Forest/Foothill Ranch': 'Lake Forest',
	'Lake Forest/FHR': 'Lake Forest',
	'Westminster/Fountain Valley': 'Westminster',
	'Long Beach/Orange County': 'Long Beach',
	'Missions Viejo': 'Mission Viejo',
	'Monte Vista': 'Irvine',
	Newport: 'Newport Beach',
	DTF: 'Other',
	'Beach Blvd @ Indianapolis': 'Huntington Beach',
	'Los Feliz': 'Other',
	Norwalk: 'Other',
	Artesia: 'Other',
	'La Palma': 'Buena Park',
	Stanton: 'Other',
	Silverado: 'Other',
	'Trabuco Canyon': 'Mission Viejo',
	'Rancho Santa Margarita': 'Mission Viejo',
	'Ladera Ranch': 'Mission Viejo',
	'Corona del Mar': 'Newport Beach'
};

export function normalizeCity(location: string | null): string | null {
	if (!location) return null;
	return CITY_NORMALIZE[location] || location;
}

// Search synonyms for fuzzy filter matching
export const FILTER_SYNONYMS: Record<string, string[]> = {
	// Cuisine synonyms
	Mexican: ['tacos', 'taqueria', 'burritos', 'enchiladas', 'mexican food'],
	Italian: ['pasta', 'italian food'],
	Vietnamese: ['pho', 'banh mi', 'viet'],
	Japanese: ['sushi', 'ramen', 'izakaya', 'japanese food'],
	Chinese: ['dim sum', 'chinese food', 'noodles'],
	Korean: ['kbbq', 'korean bbq', 'korean food'],
	Thai: ['thai food', 'pad thai', 'laotian', 'lao'],
	Indian: ['curry', 'indian food', 'tandoori', 'naan'],
	Burgers: ['burger', 'hamburger', 'hamburgers'],
	Pizza: ['pizzeria', 'pizzas'],
	Bakery: ['bakeries', 'baked goods', 'pastries', 'pastry'],
	BBQ: ['barbecue', 'barbeque', 'smoked meat'],
	Breakfast: ['brunch', 'diner', 'pancakes', 'waffles'],
	Mediterranean: ['med', 'hummus', 'falafel', 'greek'],
	Greek: ['gyro', 'gyros', 'souvlaki'],
	Persian: ['iranian'],
	Sandwiches: ['sandwich', 'subs', 'hoagie', 'hoagies'],
	Deli: ['delis', 'delicatessen'],
	Seafood: ['fish', 'shrimp', 'lobster', 'crab'],
	Vegan: ['vegetarian', 'plant-based', 'plant based'],
	Cafe: ['coffee', 'coffeeshop', 'coffee shop'],
	Dessert: ['ice cream', 'donuts', 'doughnuts', 'sweets', 'treats', 'gelato'],
	'Latin American': ['salvadoran', 'peruvian', 'pupusas', 'empanadas'],
	'Southeast Asian': ['malaysian', 'singaporean', 'burmese'],
	European: ['french', 'german', 'british', 'danish', 'english'],
	American: ['american food', 'comfort food', 'steakhouse', 'steak'],

	// City synonyms
	'Huntington Beach': ['hb', 'huntington', 'surf city'],
	'Costa Mesa': ['costa mesa'],
	'Santa Ana': ['santa ana', 'dtsa'],
	'San Juan Capistrano': ['sjc', 'san juan', 'capistrano'],
	'Newport Beach': ['newport', 'cdm', 'corona del mar'],
	'Garden Grove': ['gg', 'garden grove'],
	'Lake Forest': ['lf', 'lake forest', 'foothill ranch', 'fhr'],
	'San Clemente': ['san clemente'],
	'Laguna Beach': ['laguna'],
	'Laguna Hills': ['laguna hills'],
	'Laguna Niguel': ['laguna niguel'],
	'Aliso Viejo': ['aliso'],
	'Fountain Valley': ['fv', 'fountain valley'],
	'Yorba Linda': ['yl', 'yorba linda'],
	'Mission Viejo': ['mv', 'mission viejo'],
	'Dana Point': ['dana point'],
	Westminster: ['westy', 'little saigon'],
	Anaheim: ['anaheim hills'],
	Fullerton: ['fullerton'],
	Tustin: ['old town tustin'],
	Orange: ['old towne orange'],
	Irvine: ['irvine'],
	'Los Alamitos': ['los al', 'los alamitos'],
	'Buena Park': ['bp', 'buena park'],
	Brea: ['brea'],
	'La Habra': ['la habra'],
	Cypress: ['cypress'],
	Placentia: ['placentia']
};

export function getEngagement(r: Restaurant): number {
	return r.aggregate_score + r.endorsements.length + r.mention_count;
}

// Find the best filter match for a search term
export function findFilterMatch(
	query: string,
	cuisineNames: string[],
	cityNames: string[]
): { type: 'cuisine' | 'city'; value: string } | null {
	const q = query.toLowerCase().trim();
	if (!q) return null;

	// Direct match on cuisine name
	for (const name of cuisineNames) {
		if (name.toLowerCase() === q) return { type: 'cuisine', value: name };
	}

	// Direct match on city name
	for (const name of cityNames) {
		if (name.toLowerCase() === q) return { type: 'city', value: name };
	}

	// Synonym match
	for (const [canonical, synonyms] of Object.entries(FILTER_SYNONYMS)) {
		for (const syn of synonyms) {
			if (q === syn.toLowerCase() || syn.toLowerCase().includes(q) || q.includes(syn.toLowerCase())) {
				if (cuisineNames.includes(canonical)) return { type: 'cuisine', value: canonical };
				if (cityNames.includes(canonical)) return { type: 'city', value: canonical };
			}
		}
	}

	// Partial match on cuisine names (start of word)
	for (const name of cuisineNames) {
		if (name.toLowerCase().startsWith(q) || q.startsWith(name.toLowerCase())) {
			return { type: 'cuisine', value: name };
		}
	}

	// Partial match on city names
	for (const name of cityNames) {
		if (name.toLowerCase().startsWith(q) || q.startsWith(name.toLowerCase())) {
			return { type: 'city', value: name };
		}
	}

	return null;
}
