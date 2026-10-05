<script lang="ts">
	import LocationScope from '$lib/restaurants/components/LocationScope.svelte';
	import type { PageData } from './$types';
	import { sourceUrl } from '$lib/restaurants/source-url';
	import { googleMapsUrl } from '$lib/restaurants/maps-url';
	import { formatMonthYear } from '$lib/restaurants/stores.svelte';
	let { data }: { data: PageData } = $props();
	const restaurant = $derived(data.restaurant);

</script>
<svelte:head>
	<title>{data.title}</title>
	<meta name="description" content={data.description} />
	<meta name="robots" content={restaurant.indexable ? 'index,follow' : 'noindex,follow'} />
	<link rel="canonical" href={data.canonical} />
	<meta property="og:title" content={data.title} />
	<meta property="og:description" content={data.description} />
	<meta property="og:url" content={data.canonical} />
	{@html `<script type="application/ld+json">${data.structuredData}</script>`}
</svelte:head>
<main id="main-content" tabindex="-1" class="detail-page">
	<nav aria-label="Breadcrumb"><a href="/">OC Food Recs</a><span aria-hidden="true"> / </span><span>{restaurant.name}</span></nav>
	<header>
		<p class="eyebrow">Community recommendations</p>
		<h1>{restaurant.name}</h1>
		<p class="identity">{[restaurant.cuisine, data.city?.label, restaurant.street].filter(Boolean).join(' · ')}</p>
		<LocationScope scope={restaurant.location_scope} locations={restaurant.reviewed_locations} />
		<p class="date">{restaurant.lastmod ? `Last mentioned ${formatMonthYear(Date.parse(restaurant.lastmod))}` : 'Mention date unknown'}</p>
		<p>{restaurant.mention_count} source comment{restaurant.mention_count === 1 ? '' : 's'} from {restaurant.people_count} contributor{restaurant.people_count === 1 ? '' : 's'} across {restaurant.thread_count} thread{restaurant.thread_count === 1 ? '' : 's'}.
			Community score {restaurant.aggregate_score}, based on shared upvotes and repeat contributors.</p>
		<p class="context">Recommendations describe the experience when the comment was posted. Check current details before visiting.</p>
		<div class="actions">{#if restaurant.location_scope !== 'multiple_locations'}<a href={googleMapsUrl(restaurant)} target="_blank" rel="noopener noreferrer">Find on Google Maps</a>{/if}
			<a href={`/?restaurant=${encodeURIComponent(restaurant.slug)}`}>Explore in the list</a></div>
	</header>
	<section aria-labelledby="sources-heading">
		<h2 id="sources-heading">What the community says</h2>
		{#each restaurant.mentions as mention (`${mention.thread_id}/${mention.comment_id}`)}
			<article class="source-card">
				<p class="attribution">{mention.author && !['[deleted]', '[removed]'].includes(mention.author) ? `u/${mention.author}` : 'Author unavailable'}
					{#if mention.comment_date} · {formatMonthYear(Date.parse(mention.comment_date))}{/if}</p>
				{#if mention.body}<blockquote>{mention.body}</blockquote>{:else}<p class="context">Comment text unavailable.</p>{/if}
				{#if sourceUrl(mention)}<a href={sourceUrl(mention)} target="_blank" rel="noopener noreferrer">Read the full comment on Reddit →</a>{/if}
			</article>
		{/each}
	</section>
	{#if data.city || data.cuisine}<section aria-labelledby="browse-heading"><h2 id="browse-heading">Keep exploring</h2><div class="actions">
		{#if data.city}<a href={`/city/${data.city.slug}`}>More in {data.city.label}</a>{/if}
		{#if data.cuisine}<a href={`/cuisine/${data.cuisine.slug}`}>{data.cuisine.label} recommendations</a>{/if}
	</div></section>{/if}
	<p class="context">Excerpts are attributed to their original Reddit sources. <a href="/about">About the collection and removal requests</a>.</p>
</main>
<style>
	.detail-page { max-width: 800px; margin: 0 auto; padding: 1.5rem 1.25rem 3rem; overflow-wrap: anywhere; }
	nav { font-size: 0.85rem; } a { color: #a52e00; text-underline-offset: 3px; }
	header { padding: 1.5rem 0; } h1 { font-family: 'DM Serif Display', Georgia, serif; font-size: clamp(2rem, 6vw, 3.5rem); font-weight: 400; line-height: 1.1; margin: 0.5rem 0 1rem; }
	h2 { font-family: 'DM Serif Display', Georgia, serif; font-weight: 400; font-size: 1.6rem; }
	.eyebrow, .attribution, .date { font-size: 0.85rem; color: #64594e; } .eyebrow { text-transform: uppercase; letter-spacing: 0.07em; }
	.context { font-size: 0.9rem; color: #64594e; } .actions { display: flex; flex-wrap: wrap; gap: 0.75rem; }
	.actions a { display: inline-flex; align-items: center; min-height: 44px; padding: 0.5rem 0.8rem; border: 1px solid #d4c8bb; border-radius: 6px; background: #fffcf8; }
	.source-card { padding: 1rem 1.2rem; border: 1px solid #e0d7cd; border-radius: 8px; margin: 1rem 0; background: #fffcf8; }
	blockquote { margin: 0.5rem 0 1rem; white-space: pre-line; } .source-card > a { display: inline-flex; align-items: center; min-height: 44px; }
</style>
