<script lang="ts">
	import { page } from '$app/stores';
	import Displays from '$lib/components/Displays.svelte';
	import { Button } from '$lib/components/ui/button';
	import { enhance } from '$app/forms';
	import type { Display, DisplayGroup, Slide, User } from '@prisma/client';

	type DisplayWithSlides = Display & { slides: Slide[] };
	type DisplayGroupWithDisplays = DisplayGroup & { displays: DisplayWithSlides[] };

	let displayGroups: DisplayGroupWithDisplays[] = $derived($page.data.displayGroups);
	let user: User | undefined = $derived($page.data.user);

	const hour = new Date().getHours();
	const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
</script>

<div class="space-y-6 p-4 md:p-8">
	<div class="flex flex-wrap items-center justify-between gap-4">
		<h1 class="text-3xl font-bold">{greeting}, {user?.name?.split(' ')[0] || 'User'}!</h1>
		{#if user?.role === 'ADMIN'}
			<form method="POST" action="?/forceSwUpdateAll" use:enhance>
				<Button type="submit" variant="outline">Force SW Update (All Connected Displays)</Button>
			</form>
		{/if}
	</div>

	{#if displayGroups && displayGroups.length > 0}
		{#each displayGroups as group (group.id)}
			<section class="space-y-4">
				<h2 class="border-b pb-2 text-2xl font-semibold">{group.name}</h2>
				{#if group.displays && group.displays.length > 0}
					<Displays displays={group.displays} showDelete={false} />
				{:else}
					<p class="text-muted-foreground italic">This group has no displays yet.</p>
				{/if}
			</section>
		{/each}
	{:else}
		<div class="flex h-64 items-center justify-center rounded-lg border-2 border-dashed">
			<p class="text-muted-foreground">No display groups found.</p>
		</div>
	{/if}
</div>
