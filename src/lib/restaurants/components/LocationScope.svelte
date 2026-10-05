<script lang="ts">
	let { scope, locations = [], compact = false }: {
		scope?: 'multiple_locations';
		locations?: { city: string; street: string }[];
		compact?: boolean;
	} = $props();
</script>

{#if scope === 'multiple_locations'}
	<div class="location-scope" class:compact>
		<p class="label">Multiple locations — {locations.map(place => place.city).join(' and ')}</p>
		{#if !compact}
			<p class="explanation">This recommendation discusses both locations. Its counts describe shared evidence, not recommendations for each branch.</p>
			<ul aria-label="Locations mentioned">
				{#each locations as place (place.city + place.street)}
					<li><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.street}, ${place.city}, CA`)}`} target="_blank" rel="noopener noreferrer">{place.city} — {place.street}</a></li>
				{/each}
			</ul>
		{/if}
	</div>
{/if}

<style>
	.location-scope { color: #64594e; font-size: 0.9rem; overflow-wrap: anywhere; }
	.label { font-weight: 600; margin: 0.4rem 0; }
	.explanation { margin: 0.5rem 0; }
	ul { list-style: none; padding: 0; margin: 0.4rem 0; }
	a { display: inline-flex; align-items: center; min-height: 44px; color: #a52e00; text-underline-offset: 3px; }
	a:focus-visible { outline: 2px solid #a52e00; outline-offset: 3px; }
	.compact { font-size: 0.8rem; }
</style>
