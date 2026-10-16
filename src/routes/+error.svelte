<script lang="ts">
	import { page } from '$app/state';
	import Button from '$lib/components/ui/button/button.svelte';

	const friendlyFallback: Record<number, string> = {
		403: 'You do not have permission to see this page.',
		404: 'Looks like we took a wrong turn...',
		500: 'Something went wrong on our side.'
	};
	const message = page.error?.message || friendlyFallback[page.status] || 'Something went wrong.';
</script>

<svelte:head>
	<title>{page.status} — RelayPoint</title>
</svelte:head>

<section class="error-container">
	<h1 class="error-code">{page.status}</h1>
	<h3 class="error-msg">{message}</h3>

	<Button size="lg" href="/dash" class="return-btn">Back to the Dashboard →</Button>
</section>

<style>
	.error-container {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 90vh;
		flex-direction: column;
	}

	.error-code {
		font-size: 15rem;
		color: var(--primary);
		padding: 0;
	}

	.error-msg {
		font-size: 2rem;
		filter: brightness(65%);
		color: var(--primary);
		padding-bottom: 2rem;
	}
</style>
