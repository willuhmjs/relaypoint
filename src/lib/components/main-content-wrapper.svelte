<script lang="ts">
	import { useSidebar } from '$lib/components/ui/sidebar/context.svelte';
	import MobileHeader from '$lib/components/mobile-header.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import type { Snippet } from 'svelte';

	const sidebar = useSidebar();
	let { children } = $props<{ children: Snippet }>();
</script>

<div class="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
	{#if sidebar.isMobile}
		<MobileHeader />
	{/if}
	<Sidebar.Inset>
		{@render children()}
	</Sidebar.Inset>
</div>
