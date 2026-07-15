<script lang="ts">
	import { ArrowUp } from 'lucide-svelte';
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';

	let visible = $state(false);

	onMount(() => {
		// On mobile the window barely scrolls (just the hero); the real scrolling happens
		// inside `.list-scroll`. On desktop only `.list-scroll` scrolls. Track both so the
		// button appears in either context.
		const scroller = document.querySelector('.list-scroll');
		const update = () => {
			const listY = scroller instanceof HTMLElement ? scroller.scrollTop : 0;
			visible = window.scrollY > 300 || listY > 300;
		};
		update();
		window.addEventListener('scroll', update, { passive: true });
		scroller?.addEventListener('scroll', update, { passive: true });
		return () => {
			window.removeEventListener('scroll', update);
			scroller?.removeEventListener('scroll', update);
		};
	});

	function scrollToTop() {
		window.scrollTo({ top: 0, behavior: 'smooth' });
		const scroller = document.querySelector('.list-scroll');
		if (scroller instanceof HTMLElement) scroller.scrollTo({ top: 0, behavior: 'smooth' });
	}
</script>

{#if visible}
	<button class="back-to-top" onclick={scrollToTop} aria-label="Back to top" transition:fade={{ duration: 200 }}>
		<span class="back-to-top-icon" aria-hidden="true"><ArrowUp size={24} /></span>
	</button>
{/if}

<style>
	.back-to-top {
		position: fixed;
		bottom: 1.5rem;
		right: 1.5rem;
		width: 44px;
		height: 44px;
		border-radius: 50%;
		border: 2px solid #ff4500;
		background: #fffcf8;
		color: #ff4500;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 2px 10px rgba(0, 0, 0, 0.12);
		transition: all 0.2s ease;
		z-index: 1250;
		padding: 6px;
	}

	.back-to-top:hover {
		background: #ff4500;
		color: #fff;
		transform: translateY(-2px);
		box-shadow: 0 4px 14px rgba(255, 69, 0, 0.3);
	}

	.back-to-top:active {
		transform: translateY(0);
		box-shadow: 0 1px 4px rgba(255, 69, 0, 0.2);
	}

	/* Flex-center the SVG and scale it to the span, so the icon stays centered even
	   where the media query shrinks the span below the SVG's fixed 24px size prop. */
	.back-to-top-icon {
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.back-to-top-icon :global(svg) {
		width: 100%;
		height: 100%;
	}

	/* Below the map breakpoint (< 1024px) the bottom-right corner belongs to the map FAB
	   (position: fixed, z-index 1300); move Back-to-Top clear of it. */
	@media (max-width: 1023px) {
		.back-to-top {
			left: max(1rem, env(safe-area-inset-left, 0px));
			right: auto;
			bottom: max(1rem, env(safe-area-inset-bottom, 0px));
		}
	}

	@media (max-width: 768px) {
		.back-to-top {
			width: 40px;
			height: 40px;
		}

		.back-to-top-icon {
			width: 20px;
			height: 20px;
		}
	}
</style>
