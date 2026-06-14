<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import { Toaster } from 'svelte-sonner';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<Toaster position="bottom-center" richColors duration={2500} closeButton />

<a href="#main-content" class="skip-link">Skip to restaurant list</a>

{@render children()}

<style>
	:global([data-sonner-toaster][data-sonner-theme='light']) {
		--normal-bg: #fffcf8;
		--normal-border: #e8e0d6;
		--normal-text: #3e2c23;
		--success-bg: #faf7f2;
		--success-border: #ff4500;
		--success-text: #ff4500;
		--error-bg: #fce8e0;
		--error-border: #b5543a;
		--error-text: #b5543a;
		--info-bg: #fffcf8;
		--info-border: #d4c8bb;
		--info-text: #5d4e37;
		--warning-bg: #faf7f2;
		--warning-border: #d4c8bb;
		--warning-text: #5d4e37;
		font-family: 'DM Sans', sans-serif;
	}
	:global([data-sonner-toast][data-styled='true']) {
		border-radius: 8px;
		box-shadow: 0 4px 12px rgba(62, 44, 35, 0.12);
		font-size: 0.875rem;
	}
	:global([data-sonner-toast][data-styled='true'] [data-title]) {
		font-weight: 600;
	}

	:global(.skip-link) {
		position: absolute;
		left: -9999px;
		top: 0;
		z-index: 9999;
		padding: 0.75rem 1rem;
		background: #ff4500;
		color: #fffdf9;
		font-family: 'DM Sans', sans-serif;
		font-weight: 600;
		text-decoration: none;
		border-radius: 0 0 8px 0;
	}

	:global(.skip-link:focus) {
		left: 0;
	}
</style>
