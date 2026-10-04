<script lang="ts">
	import PublicHubPage from '$lib/restaurants/components/PublicHubPage.svelte';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>
<PublicHubPage {data} />
