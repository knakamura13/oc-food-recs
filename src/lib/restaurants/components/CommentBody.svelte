<script lang="ts">
	import { tokenizeCommentBody, type BodyToken } from '$lib/restaurants/comment-body';
	import { findRestaurantMatch } from '$lib/restaurants/snippet';

	interface Props {
		body: string;
		restaurantName: string;
		otherPlaces?: { slug: string; name: string }[];
		openableSlugs?: ReadonlySet<string>;
		onOpenPlace?: (slug: string) => void;
		/** Endorsement cards: smaller type, clamped on phones with a Read more toggle. */
		clampable?: boolean;
	}

	let {
		body,
		restaurantName,
		otherPlaces = [],
		openableSlugs,
		onOpenPlace,
		clampable = false
	}: Props = $props();

	const MAX_PLACES = 8;
	const CLAMP_MIN_CHARS = 280;

	let showFull = $state(false);
	let expanded = $state(false);

	const multi = $derived(otherPlaces.length > 0);
	const clamped = $derived(clampable && !multi && body.length > CLAMP_MIN_CHARS && !expanded);
	const focusLine = $derived.by(() => {
		const lines = body.split('\n').filter((l) => l.trim());
		return (
			lines.find((l) => findRestaurantMatch(l, restaurantName)) ?? lines[0] ?? body
		);
	});
	const hasMoreLines = $derived(multi && body.split('\n').filter((l) => l.trim()).length > 1);
	const focused = $derived(hasMoreLines && !showFull);
	const paragraphs = $derived(tokenizeCommentBody(focused ? focusLine : body));
	const shownPlaces = $derived(otherPlaces.slice(0, MAX_PLACES));
</script>

{#snippet inline(tokens: BodyToken[])}
	{#each tokens as t, i (i)}
		{#if t.type === 'bold'}
			<strong>{t.text}</strong>
		{:else if t.type === 'link'}
			<a href={t.href} target="_blank" rel="noopener noreferrer nofollow">{t.text}</a>
		{:else if t.type === 'break'}
			<br />
		{:else}
			{t.text}
		{/if}
	{/each}
{/snippet}

<div class="comment-text" class:endorsement={clampable} class:clamped>
	{#each paragraphs as tokens, i (i)}
		{#if focused}
			<div class="match-line">{@render inline(tokens)}</div>
		{:else}
			<p>{@render inline(tokens)}</p>
		{/if}
	{/each}
</div>

{#if multi}
	<p class="other-places">
		…and {otherPlaces.length} other place{otherPlaces.length === 1 ? '' : 's'} in this comment:
		{#each shownPlaces as place, i (place.slug)}
			{#if openableSlugs?.has(place.slug) && onOpenPlace}
				<button type="button" class="place-link" onclick={() => onOpenPlace?.(place.slug)}>
					{place.name}
				</button>
			{:else}
				<span>{place.name}</span>
			{/if}{i < shownPlaces.length - 1 ? ', ' : ''}
		{/each}
		{#if otherPlaces.length > MAX_PLACES}
			and {otherPlaces.length - MAX_PLACES} more
		{/if}
	</p>
	{#if hasMoreLines}
		<button
			type="button"
			class="comment-toggle"
			aria-expanded={showFull}
			onclick={() => (showFull = !showFull)}
		>
			{showFull ? 'Hide full comment' : 'Show full comment'}
		</button>
	{/if}
{:else if clampable && body.length > CLAMP_MIN_CHARS}
	<button
		type="button"
		class="read-more"
		aria-expanded={expanded}
		onclick={() => (expanded = !expanded)}
	>
		{expanded ? 'Show less' : 'Read more'}
	</button>
{/if}

<style>
	.comment-text {
		font-family: 'DM Serif Display', Georgia, serif;
		font-size: 1rem;
		font-style: italic;
		line-height: 1.5;
		color: #3e2c23;
		overflow-wrap: anywhere;
	}

	.comment-text.endorsement {
		font-family: inherit;
		font-style: normal;
		font-size: 0.85rem;
	}

	.comment-text p {
		margin: 0 0 0.5rem;
	}

	.comment-text p:last-child {
		margin-bottom: 0;
	}

	.comment-text a {
		color: #c43700;
		text-decoration: underline;
	}

	.match-line {
		border-left: 3px solid #e0a98e;
		background: #fbf1e8;
		padding: 0.25rem 0.5rem;
		border-radius: 0 4px 4px 0;
	}

	.other-places {
		margin: 0.4rem 0 0;
		font-size: 0.8rem;
		color: #7a6e63;
		overflow-wrap: anywhere;
	}

	.place-link,
	.comment-toggle,
	.read-more {
		background: none;
		border: 0;
		padding: 0;
		font: inherit;
		color: #c43700;
		text-decoration: underline;
		cursor: pointer;
	}

	.comment-toggle,
	.read-more {
		display: inline-block;
		margin-top: 0.3rem;
		font-size: 0.78rem;
	}

	.read-more {
		display: none;
	}

	@media (max-width: 1023px) {
		.comment-toggle {
			min-height: 44px;
		}

		.comment-text.endorsement {
			font-size: 1rem;
			line-height: 1.55;
		}

		.comment-text.clamped {
			display: -webkit-box;
			-webkit-line-clamp: 8;
			line-clamp: 8;
			-webkit-box-orient: vertical;
			overflow: hidden;
		}

		.read-more {
			display: inline-block;
			min-height: 44px;
		}
	}
</style>
