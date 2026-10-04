<script lang="ts">
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>
<svelte:head><title>Browse cities and cuisines | OC Food Recs</title><link rel="canonical" href={data.canonical} /><meta name="robots" content="noindex,follow" /></svelte:head>
<main id="main-content" tabindex="-1"><a href="/">← Restaurant explorer</a><h1>Browse community recommendations</h1>
	{#each data.groups as group (group.kind)}<section><h2>{group.kind === 'city' ? 'Cities' : 'Cuisines'}</h2><ul>
		{#each group.hubs as hub (hub.slug)}<li><a href={`/${group.kind}/${hub.slug}`}>{hub.label} <span>{hub.count}</span></a></li>{/each}
	</ul></section>{/each}
</main>
<style>
	main { max-width: 900px; padding: 1.5rem 1.25rem 3rem; margin: auto; overflow-wrap: anywhere; } a { color: #a52e00; }
	h1,h2 { font-family: 'DM Serif Display', Georgia, serif; font-weight: 400; } h1 { font-size: clamp(2rem,6vw,3rem); }
	ul { display: grid; grid-template-columns: repeat(auto-fit,minmax(180px,1fr)); list-style: none; padding: 0; gap: 0.5rem; }
	li a { display: flex; gap: 1rem; align-items: center; min-height: 44px; padding: 0.5rem; border-bottom: 1px solid #e0d7cd; } span { color: #64594e; }
</style>
