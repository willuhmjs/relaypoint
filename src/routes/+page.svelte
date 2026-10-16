<script>
	import Button from '$lib/components/ui/button/button.svelte';
</script>

<svelte:head>
	<title>RelayPoint — Digital Signage, Simplified</title>
	<meta
		name="description"
		content="RelayPoint is free, open-source digital signage you host yourself. Manage screens centrally, sync a fleet with WebSocket-driven timelines, and log in with your own SSO."
	/>
	<meta property="og:title" content="RelayPoint — Digital Signage, Simplified" />
	<meta
		property="og:description"
		content="Self-hosted digital signage: centrally managed screens, live-synchronized kiosks, OAuth/OIDC SSO, and no per-screen fees."
	/>
	<meta property="og:type" content="website" />
	<meta property="og:image" content="/og-image.png" />
	<meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<section class="landing-page">
	<div class="splash-container">
		<h1 class="logo">RelayPoint</h1>
		<h2 class="description">Digital Signage, Simplified.</h2>

		<p class="tagline">
			Self-hosted screens with a dashboard your whole team can use — no per-display fees, no vendor
			lock-in, and SSO with the identity provider you already run.
		</p>

		<div class="splash-btn-container">
			<Button href="/dash" size="lg">Dashboard →</Button>
			<Button href="/login" size="lg" variant="outline">Login</Button>
		</div>
	</div>

	<div class="feature-grid">
		<div class="feature-card">
			<h3>Fleet-synced playback</h3>
			<p>
				WebSocket-driven updates and an NTP-corrected shared timeline keep groups of screens
				frame-accurate — restart a whole group's presentation with one click.
			</p>
		</div>
		<div class="feature-card">
			<h3>Images, video, HTML</h3>
			<p>
				Drop in images and videos, or upload full interactive HTML slides. PowerPoint and PDF are
				converted to slides for you.
			</p>
		</div>
		<div class="feature-card">
			<h3>Your auth, your hardware</h3>
			<p>
				Plug in any OAuth 2.0 / OIDC provider (Keycloak, Google, GitHub…), run it on a VM or a
				Raspberry Pi, and keep every byte of content in your own storage.
			</p>
		</div>
	</div>

	<div class="screenshot">
		<img
			src="/screenshots/dashboard.png"
			alt="RelayPoint dashboard showing managed displays"
			loading="lazy"
			width="1440"
			height="938"
		/>
	</div>
</section>

<style>
	.landing-page {
		min-height: 80vh;
		display: flex;
		flex-direction: column;
		justify-content: center;
		text-align: center;
		align-items: center;
		padding: 4rem 1rem 2rem;
		gap: 3rem;
	}

	.splash-container {
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.logo {
		font-family: var(--font-logo);
		font-size: clamp(2.5rem, 9vw, 5rem);
		font-weight: 700;
		color: var(--primary);
		line-height: 1.1;
		word-break: break-word;
	}

	.description {
		font-size: clamp(1.25rem, 4.5vw, 2.5rem);
		color: var(--secondary-foreground);
		margin-top: 0.25rem;
	}

	.tagline {
		max-width: 42rem;
		margin: 1.25rem auto 0;
		font-size: clamp(0.95rem, 2.5vw, 1.15rem);
		line-height: 1.6;
		color: var(--muted-foreground);
	}

	.splash-btn-container {
		padding-top: 2rem;
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
		justify-content: center;
	}

	.feature-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr));
		gap: 1.25rem;
		max-width: 64rem;
		width: 100%;
	}

	.feature-card {
		border: 1px solid var(--border);
		border-radius: 0.75rem;
		padding: 1.5rem;
		text-align: left;
		background: var(--card);
	}

	.feature-card h3 {
		font-size: 1.05rem;
		font-weight: 600;
		margin-bottom: 0.5rem;
		color: var(--card-foreground);
	}

	.feature-card p {
		font-size: 0.9rem;
		line-height: 1.55;
		color: var(--muted-foreground);
	}

	.screenshot {
		max-width: 64rem;
		width: 100%;
		border: 1px solid var(--border);
		border-radius: 0.75rem;
		overflow: hidden;
		box-shadow: 0 20px 50px -20px rgb(0 0 0 / 0.35);
	}

	.screenshot img {
		display: block;
		width: 100%;
		height: auto;
	}
</style>
