import { error } from '@sveltejs/kit';
import { listPublicRestaurants } from './public-restaurant';
import { deploymentOrigin, jsonLd, publicHubs, hubExplorerUrl, sourceUrl, type HubKind } from './public-pages';
import { SOURCE_CACHE_CONTROL } from '$lib/server/cache-control';
export async function loadHub(kind: HubKind, slug: string, setHeaders: (headers: Record<string, string>) => void) {
	const hub = publicHubs(await listPublicRestaurants(), kind).find(h => h.slug === slug);
	if (!hub) { setHeaders({ 'cache-control': 'no-store' }); error(404, 'Category not found'); }
	setHeaders({ 'cache-control': SOURCE_CACHE_CONTROL });
	const origin = deploymentOrigin();
	const canonical = `${origin}/${kind}/${hub.slug}`;
	const title = `${kind === 'city' ? `Restaurants in ${hub.label}` : `${hub.label} restaurants`} | OC Food Recs`;
	return { hub: { ...hub, restaurants: hub.restaurants.slice(0, 20).map(r => ({
		name: r.name, slug: r.slug, location: r.location, cuisine: r.cuisine,
		mention_count: r.mention_count, thread_count: r.thread_count, lastmod: r.lastmod,
		excerpt: r.mentions.find(m => m.body.trim())?.body ?? null,
		excerpt_author: r.mentions.find(m => m.body.trim())?.author ?? null,
		excerpt_url: r.mentions.find(m => m.body.trim()) ? sourceUrl(r.mentions.find(m => m.body.trim())!) : null
	})) }, canonical, title,
		description: `${hub.restaurant_count} restaurants with published community recommendations. ${hub.eligible_count} have mapped locations and enough distinct source evidence for indexing.`,
		explorerUrl: hubExplorerUrl(hub),
		structuredData: jsonLd({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
			{ '@type': 'ListItem', position: 1, name: 'OC Food Recs', item: origin },
			{ '@type': 'ListItem', position: 2, name: hub.label, item: canonical }
		] }) };
}
