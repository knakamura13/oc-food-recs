<script lang="ts">
	import { formatMonthYear } from '$lib/restaurants/stores.svelte';
	import type { loadHub } from '$lib/server/restaurants/hub-load';
	let { data }: { data: Awaited<ReturnType<typeof loadHub>> } = $props();
</script>
<svelte:head>
	<title>{data.title}</title><meta name="description" content={data.description} />
	<meta name="robots" content={data.hub.indexable ? 'index,follow' : 'noindex,follow'} />
	<link rel="canonical" href={data.canonical} />
	{@html `<script type="application/ld+json">${data.structuredData}</script>`}
</svelte:head>
<main id="main-content" tabindex="-1">
	<nav aria-label="Breadcrumb"><a href="/">OC Food Recs</a> / <span>{data.hub.label}</span></nav>
	<h1>{data.hub.kind === 'city' ? `Restaurants in ${data.hub.label}` : `${data.hub.label} restaurants`}</h1>
	<p>{data.hub.restaurant_count} restaurants with published source evidence. {data.hub.eligible_count} have a mapped location and enough distinct comment text for indexing, drawn from {data.hub.thread_count} source threads.</p>
	<p class="context">A selection from Reddit community recommendations. Comment dates describe when the experience was shared; check current details before visiting.</p>
	<a class="explore" href={data.explorerUrl}>Explore all {data.hub.label} results</a>
	<section aria-label="Restaurant recommendations">
		{#each data.hub.restaurants as restaurant (restaurant.slug)}
			<article><h2><a href={`/r/${encodeURIComponent(restaurant.slug)}`}>{restaurant.name}</a></h2>
				<p class="context">{[restaurant.cuisine, restaurant.location].filter(Boolean).join(' · ')} · {restaurant.mention_count} source comments</p>
				{#if restaurant.excerpt}<blockquote>{restaurant.excerpt}</blockquote>
					<p class="context">{restaurant.excerpt_author && !['[deleted]', '[removed]'].includes(restaurant.excerpt_author) ? `u/${restaurant.excerpt_author}` : 'Author unavailable'}
					{#if restaurant.excerpt_url} · <a href={restaurant.excerpt_url} target="_blank" rel="noopener noreferrer">Read the full comment on Reddit</a>{/if}</p>{/if}
				<p class="context">{restaurant.lastmod ? `Last mentioned ${formatMonthYear(Date.parse(restaurant.lastmod))}` : 'Mention date unknown'}</p>
			</article>
		{/each}
	</section>
	<p class="context"><a href="/browse">Browse more cities and cuisines</a> · <a href="/about">Sources and removal requests</a></p>
</main>
<style>
	main { max-width: 800px; margin: 0 auto; padding: 1.5rem 1.25rem 3rem; overflow-wrap: anywhere; }
	nav, .context { font-size: 0.9rem; color: #64594e; } a { color: #a52e00; text-underline-offset: 3px; }
	h1, h2 { font-family: 'DM Serif Display', Georgia, serif; font-weight: 400; line-height: 1.2; }
	h1 { font-size: clamp(2rem, 6vw, 3rem); } h2 { font-size: 1.5rem; margin: 0; }
	article { background: #fffcf8; border: 1px solid #e0d7cd; border-radius: 8px; padding: 1.2rem; margin: 1rem 0; }
	.explore { display: inline-flex; min-height: 44px; align-items: center; border: 1px solid #d4c8bb; border-radius: 6px; padding: 0.5rem 0.8rem; }
	blockquote { margin: 0.5rem 0; white-space: pre-line; }
	article h2 a { display: inline-flex; align-items: center; min-height: 44px; }
</style>
