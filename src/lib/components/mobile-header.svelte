<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import MenuIcon from '@lucide/svelte/icons/menu';
	import { useSidebar } from '$lib/components/ui/sidebar/context.svelte';

	const sidebar = useSidebar();
</script>

<header class="flex h-14 items-center gap-4 border-b bg-muted/40 px-4 lg:h-[60px] lg:px-6">
	<Button variant="ghost" size="icon" class="md:hidden" onclick={() => sidebar.setOpenMobile(true)}>
		<MenuIcon class="h-5 w-5" />
		<span class="sr-only">Toggle sidebar</span>
	</Button>
</header>
