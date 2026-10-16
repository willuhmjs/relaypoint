<script lang="ts">
	import type { Display } from '@prisma/client';
	import DisplayCard from '$lib/components/ui/display/DisplayCard.svelte';

	const { displays, showDelete = true }: { displays: Display[]; showDelete?: boolean } = $props();
</script>

<div class="grid [grid-template-columns:repeat(auto-fill,minmax(22rem,1fr))] gap-4">
	{#each displays as display (display.id)}
		<DisplayCard {display} {showDelete} />
	{/each}
</div>
