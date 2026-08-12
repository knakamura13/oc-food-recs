<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import { requestSkipToList } from '$lib/restaurants/skip-to-list';
	import { Toaster } from 'svelte-sonner';

	let { children } = $props();

	function focusRestaurantList(event: MouseEvent) {
		event.preventDefault();
		const main = document.getElementById('main-content');
		if (main instanceof HTMLElement) {
			main.focus();
			// Real rows mean skip already landed; the skeleton has `.row` but no toggles.
			if (main.querySelector('.row-toggle')) return;
		}
		requestSkipToList();
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<Toaster position="bottom-center" richColors duration={2500} closeButton />

<a href="#main-content" class="skip-link" onclick={focusRestaurantList}>Skip to restaurant list</a>

{@render children()}

<style>
	:global(html) {
		color-scheme: light;
		accent-color: #ff4500;
		-webkit-tap-highlight-color: rgba(255, 69, 0, 0.2);
		scroll-behavior: smooth;
	}

	:global(body) {
		margin: 0;
		font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue',
			Arial, sans-serif;
		color: #3e2c23;
		background: #faf7f2;
		-webkit-font-smoothing: antialiased;
		-moz-osx-font-smoothing: grayscale;
		line-height: 1.55;
	}

	:global(*) {
		box-sizing: border-box;
	}

	:global(button) {
		font-family: inherit;
	}

	:global(button),
	:global(a),
	:global([role='button']) {
		touch-action: manipulation;
	}

	:global(*:focus-visible) {
		outline: 2px solid #ff4500;
		outline-offset: 2px;
	}

	:global(::selection) {
		background: #ff4500;
		color: #fffdf9;
	}

	@media (prefers-reduced-motion: reduce) {
		:global(*),
		:global(*::before),
		:global(*::after) {
			transition-duration: 0.01ms !important;
			animation-duration: 0.01ms !important;
			animation-iteration-count: 1 !important;
			scroll-behavior: auto !important;
		}
	}

	@media (forced-colors: active) {
		:global(*:focus-visible) {
			outline: 2px solid Highlight;
			outline-offset: 2px;
		}

		:global(button),
		:global([role='button']) {
			background-color: ButtonFace;
			color: ButtonText;
			border-color: ButtonText;
		}

		:global(a) {
			color: LinkText;
		}

		:global(.skip-link),
		:global(.home-link) {
			background: ButtonText;
			color: Canvas;
			border: 1px solid ButtonText;
			forced-color-adjust: none;
		}
	}

	@media (prefers-contrast: more) {
		:global(*:focus-visible) {
			outline-width: 3px;
			outline-offset: 3px;
		}
	}

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
		background: #c43700;
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
