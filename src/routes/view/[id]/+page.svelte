<script lang="ts">
	// Server-side only - CSR is disabled for this route
	// This means the page will be static HTML with no client-side JavaScript

	let { data } = $props();
	const slides = data.display.slides;
	const displayName = data.display.name;
</script>

<svelte:head>
	<title>{displayName} - View</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<!-- Mimic body styling on the wrapper div -->
<div style="min-height: 100vh; background-color: #0d131f; color: #f8fafc; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 0; display: flow-root;">
	<div style="max-width: 1200px; margin: 0 auto; padding: 1rem; padding-bottom: 5rem;">
		<h1 style="margin-bottom: 1.5rem; font-size: 1.5rem; line-height: 2rem; font-weight: 700;">{displayName} - Slides</h1>

		{#if slides.length === 0}
			<div style="display: flex; height: 16rem; align-items: center; justify-content: center; color: #9ca3af;">No slides available.</div>
		{:else}
			<div id="slides-grid" style="display: grid; gap: 1rem; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));">
				{#each slides as slide, index}
					<div class="slide-card" data-type={slide.type} data-url={"/content/" + slide.contentUrl} style="position: relative; aspect-ratio: 16/9; width: 100%; overflow: hidden; border-radius: 0.5rem; border: 2px solid transparent; background-color: #1f2937; cursor: pointer; transition: transform 0.2s;">
						{#if slide.type === 'IMAGE'}
							<div style="height: 100%; width: 100%; display: flex; align-items: center; justify-content: center; overflow: hidden; background-color: black;">
								<img
									src="/content/{slide.contentUrl}"
									alt="Slide {index + 1}"
									style="max-height: 100%; max-width: 100%; object-fit: contain;"
									loading="lazy"
								/>
							</div>
						{:else if slide.type === 'VIDEO'}
							<video
								src="/content/{slide.contentUrl}"
								style="height: 100%; width: 100%; object-fit: contain;"
								muted
								preload="metadata"
								controls
							></video>
							<div style="position: absolute; bottom: 0.25rem; right: 0.25rem; border-radius: 0.25rem; background-color: rgba(0, 0, 0, 0.6); padding: 0.125rem 0.25rem; font-size: 0.75rem; color: white;">
								VIDEO
							</div>
						{:else if slide.type === 'HTML'}
							<div style="height: 100%; width: 100%; display: flex; align-items: center; justify-content: center; overflow: hidden; background-color: white;">
								<iframe
									src="/content/{slide.contentUrl}"
									style="pointer-events: none; height: 400%; width: 400%; transform-origin: top left; transform: scale(0.25); border: 0;"
									title="Slide {index + 1} preview"
									sandbox="allow-scripts allow-same-origin"
								></iframe>
							</div>
						{/if}

						{#if slide.linkUrl}
							<a href={slide.linkUrl} target="_blank" rel="noopener noreferrer" aria-label="Open slide link" style="position: absolute; bottom: 0.5rem; left: 0.5rem; border-radius: 9999px; background-color: rgba(255, 255, 255, 0.8); padding: 0.25rem; color: black; box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 10;">
								<svg style="height: 0.75rem; width: 0.75rem;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
								</svg>
							</a>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

<dialog id="slide-modal" style="padding: 0; border: none; background: transparent; max-width: 100vw; max-height: 100vh; width: 100%; height: 100%; background-color: rgba(0,0,0,0.9); color: white; margin: 0;">
	<div style="position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">
		<button id="close-modal" style="position: absolute; top: 1rem; right: 1rem; background: none; border: none; color: white; font-size: 3rem; cursor: pointer; z-index: 20; line-height: 1;">&times;</button>
		<div id="modal-content" style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">
			<!-- Content injected here -->
		</div>
	</div>
</dialog>

<div style="display: none;">
	<script>
		(function() {
			// Reset body styles to remove white border and match theme
			document.body.style.margin = '0';
			document.body.style.padding = '0';
			document.body.style.backgroundColor = '#0d131f';
			document.body.style.color = '#f8fafc';

			const grid = document.getElementById('slides-grid');
			const modal = document.getElementById('slide-modal');
			const closeBtn = document.getElementById('close-modal');
			const modalContent = document.getElementById('modal-content');

			if (grid) {
				grid.addEventListener('click', (e) => {
					// Check if click was on a link or button inside the card
					if (e.target.closest('a') || e.target.closest('button')) return;

					const card = e.target.closest('.slide-card');
					if (card) {
						const type = card.dataset.type;
						const url = card.dataset.url;
						openModal(type, url);
					}
				});
			}

			if (closeBtn) {
				closeBtn.addEventListener('click', () => {
					closeModal();
				});
			}
			
			if (modal) {
				modal.addEventListener('click', (e) => {
					if (e.target === modal || e.target.parentElement === modal) {
						closeModal();
					}
				});
				// Close on Escape key
				modal.addEventListener('close', () => {
					modalContent.innerHTML = '';
				});
			}

			function closeModal() {
				modal.close();
				modalContent.innerHTML = ''; // Clear content to stop video/iframe
			}

			function openModal(type, url) {
				let contentHtml = '';
				if (type === 'IMAGE') {
					contentHtml = `<img src="${url}" style="max-width: 100%; max-height: 100%; object-fit: contain;">`;
				} else if (type === 'VIDEO') {
					contentHtml = `<video src="${url}" controls autoplay style="max-width: 100%; max-height: 100%;"></video>`;
				} else if (type === 'HTML') {
					contentHtml = `<iframe src="${url}" style="width: 90%; height: 90%; background: white; border: none;"></iframe>`;
				}
				modalContent.innerHTML = contentHtml;
				try {
					modal.showModal();
				} catch (e) {
					console.error("Dialog not supported", e);
					// Fallback if needed, but modern browsers support dialog
				}
			}
		})();
	</script>
</div>
