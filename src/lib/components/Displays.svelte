<script lang="ts">
	import type { Display } from '@prisma/client';
	import DisplayCard from '$lib/components/ui/display/DisplayCard.svelte';

	const { displays, showDelete = true }: { displays: Display[], showDelete?: boolean } = $props();
</script>

<div class="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(22rem,1fr))]">
    {#each displays as display (display.id)}
        <DisplayCard {display} showDelete={showDelete} />
    {/each}
</div>
