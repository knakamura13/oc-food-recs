<script lang="ts">
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
		<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
			<!-- Hand-drawn squiggly upward arrow -->
			<path
				d="M20 34 C19.5 28, 21 24, 20.2 18 C19.8 14, 20.5 11, 20 7"
				stroke="currentColor"
				stroke-width="2.5"
				stroke-linecap="round"
				fill="none"
			/>
			<!-- Sketchy arrowhead - left side -->
			<path
				d="M20 7 C18 9, 14.5 12, 11 14.5"
				stroke="currentColor"
				stroke-width="2.5"
				stroke-linecap="round"
				fill="none"
			/>
			<!-- Sketchy arrowhead - right side -->
			<path
				d="M20 7 C22.5 9.5, 25 12.5, 28.5 15"
				stroke="currentColor"
				stroke-width="2.5"
				stroke-linecap="round"
				fill="none"
			/>
		</svg>
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

	.back-to-top svg {
		width: 24px;
		height: 24px;
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

		.back-to-top svg {
			width: 20px;
			height: 20px;
		}
	}
</style>
