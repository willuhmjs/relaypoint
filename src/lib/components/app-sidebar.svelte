<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import { getContext, onMount } from 'svelte';
	import type { User } from '@prisma/client';
	import { page } from '$app/stores';
	import HomeIcon from '@lucide/svelte/icons/home';
	import NavGroups from './nav-display-groups.svelte';
	import NavAdmin from './nav-admin.svelte';
	import NavUser from './nav-user.svelte';
	import TeamSwitcher from './team-switcher.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { dashboardStore } from '$lib/stores/dashboardStore';
	import type { DisplayGroupWithRelations } from '$lib/stores/dashboardStore';

	const user = getContext<User | null>('user');

	let filteredDisplayGroups = $derived(
		$dashboardStore.activeTeam && $dashboardStore.displayGroups
			? $dashboardStore.displayGroups.filter((group) =>
					group.teams.some((t) => t.teamId === $dashboardStore.activeTeam!.id)
				)
			: []
	);

	// --- MODIFICATIONS START ---

	// State to track if the viewport is mobile-sized. Defaults to false.
	let isMobile = $state(false);

	onMount(() => {
		// Using lg breakpoint (1024px) from Tailwind as the threshold.
		const mediaQuery = window.matchMedia('(max-width: 1023px)');

		const updateIsMobile = (event: MediaQueryList | MediaQueryListEvent) => {
			isMobile = event.matches;
		};

		updateIsMobile(mediaQuery); // Set initial state
		mediaQuery.addEventListener('change', updateIsMobile);

		return () => {
			mediaQuery.removeEventListener('change', updateIsMobile);
		};
	});

	let {
		ref = $bindable(null),
		// We still accept the prop, but will override it based on `isMobile`
		collapsible = 'icon',
		...restProps
	}: ComponentProps<typeof Sidebar.Root> = $props();

	// --- MODIFICATIONS END ---
</script>

{#if $dashboardStore.isDataLoaded}
	{#if $dashboardStore.teams?.length}
		<!-- Use a key block to force a complete re-render when switching between mobile/desktop -->
		{#key isMobile}
			<Sidebar.Root
				collapsible={isMobile ? collapsible : 'none'}
				{...restProps}
				class="data-[collapsible=false]:-translate-x-0"
			>
				<Sidebar.Header>
					<TeamSwitcher />
				</Sidebar.Header>
				<Sidebar.Content>
					<Sidebar.Menu>
						<Sidebar.MenuItem class="group-data-[collapsible=icon]:justify-center">
							<Sidebar.MenuButton isActive={$page.url.pathname === '/dash'} size="lg">
								{#snippet child({ props })}
									<a href="/dash" {...props}>
										<HomeIcon />
										<span class="group-data-[collapsible=icon]:hidden">Dashboard</span>
									</a>
								{/snippet}
							</Sidebar.MenuButton>
						</Sidebar.MenuItem>
					</Sidebar.Menu>
					<Sidebar.Separator />
					<NavAdmin displayGroups={$dashboardStore.displayGroups} teams={$dashboardStore.teams} />
					<NavGroups displayGroups={filteredDisplayGroups} />
				</Sidebar.Content>
				<Sidebar.Footer>
					<NavUser {user} />
				</Sidebar.Footer>
				<!-- The Rail is only necessary for the collapsible mobile version -->
				{#if isMobile}
					<Sidebar.Rail />
				{/if}
			</Sidebar.Root>
		{/key}
	{:else}
		<Sidebar.Root>
			<Sidebar.Header>
				<div class="p-4 font-bold">No Team</div>
			</Sidebar.Header>
			<Sidebar.Content class="p-4">
				<p>You are not in any teams.</p>
				<p>Please contact an administrator.</p>
			</Sidebar.Content>
			<Sidebar.Footer>
				<NavUser {user} />
			</Sidebar.Footer>
		</Sidebar.Root>
	{/if}
{:else}
	<!-- Also apply the logic to the skeleton loader -->
	{#key isMobile}
		<Sidebar.Root collapsible={isMobile ? collapsible : 'none'} {...restProps}>
			<Sidebar.Header>
				<Sidebar.Menu>
					<Sidebar.MenuItem>
						<Sidebar.MenuSkeleton showIcon />
					</Sidebar.MenuItem>
				</Sidebar.Menu>
			</Sidebar.Header>
			<Sidebar.Content>
				<Sidebar.MenuSkeleton />
				<Sidebar.MenuSkeleton />
			</Sidebar.Content>
		</Sidebar.Root>
	{/key}
{/if}