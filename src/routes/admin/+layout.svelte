<script lang="ts">
	import { page } from '$app/state';

	let { children } = $props();

	const tabs = [
		{ href: '/admin/geocode', label: 'Geocode Health' },
		{ href: '/admin/exclusions', label: 'Exclusions' }
	];

	function isActive(href: string): boolean {
		return page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
	}
</script>

<div class="admin-shell">
	<nav class="admin-nav" aria-label="Admin sections">
		{#each tabs as tab (tab.href)}
			<a href={tab.href} class:active={isActive(tab.href)}>{tab.label}</a>
		{/each}
	</nav>
	{@render children()}
</div>

<style>
	.admin-shell {
		min-height: 100vh;
		background: #faf7f2;
	}

	.admin-nav {
		display: flex;
		gap: 0.25rem;
		padding: 1rem 1.5rem 0;
		max-width: 960px;
		margin: 0 auto;
		border-bottom: 1px solid #e2d9ce;
	}

	.admin-nav a {
		padding: 0.55rem 1rem;
		font-family: 'DM Sans', system-ui, sans-serif;
		font-size: 0.9rem;
		font-weight: 500;
		color: #7a6e63;
		text-decoration: none;
		border-radius: 8px 8px 0 0;
		border: 1px solid transparent;
		border-bottom: none;
		margin-bottom: -1px;
	}

	.admin-nav a:hover {
		color: #3e2c23;
		background: rgba(255, 69, 0, 0.06);
	}

	.admin-nav a.active {
		color: #3e2c23;
		background: #fffdf9;
		border-color: #e2d9ce;
		font-weight: 600;
	}
</style>
