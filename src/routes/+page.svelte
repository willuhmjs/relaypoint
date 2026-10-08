<script>
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
</script>

<section class="landing-page">
	<div class="splash-container">
		<h1 class="logo">RelayPoint</h1>
		<h2 class="description">Digital Signage, Simplified.</h2>

		<div class="splash-btn-container">
			<Button href="/dash" size="lg">Dashboard →</Button>
		</div>
	</div>
</section>

<style>
	.landing-page {
		height: 90vh;
		display: flex;
		flex-direction: column;
		justify-content: center;
		text-align: center;
		align-items: center;
	}

	.logo {
		font-family: var(--font-logo);
		font-size: 5rem;
		font-weight: 700;
		color: var(--primary);
	}

	.description {
		font-size: 2.5rem;
		color: var(--secondary-foreground);
	}

	.splash-btn-container {
		padding-top: 3rem;
	}
</style>
