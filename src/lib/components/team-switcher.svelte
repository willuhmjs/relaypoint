<script lang="ts">
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { useSidebar } from '$lib/components/ui/sidebar/index.js';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import type { Team, User } from '@prisma/client';
	import { Button } from '$lib/components/ui/button/index.js';
	import { getContext } from 'svelte';
	import { page } from '$app/stores';
	import { dashboardStore, activeTeam } from '$lib/stores/dashboardStore';

	type UserWithTeams = User & {
		teams: {
			team: Team;
		}[];
	};

	const user = getContext<UserWithTeams | null>('user');
	const teams: Team[] | { team: Team }[] | null = $derived(
		$page.data.teams || user?.teams || null
	);

	const sidebar = useSidebar();
</script>

{#if $activeTeam}
	<Sidebar.Menu>
		<Sidebar.MenuItem>
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Sidebar.MenuButton
							{...props}
							size="lg"
							class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
						>
							<div
								class="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg"
							>
								{$activeTeam?.name.charAt(0).toUpperCase()}
							</div>
							<div class="grid flex-1 text-left text-sm leading-tight">
								<span class="truncate font-medium">
									{$activeTeam?.name}
								</span>
							</div>
							<ChevronsUpDownIcon class="ml-auto" />
						</Sidebar.MenuButton>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content
					class="w-(--bits-dropdown-menu-anchor-width) min-w-56 rounded-lg"
					align="start"
					side={sidebar.isMobile ? 'bottom' : 'right'}
					sideOffset={4}
				>
					<DropdownMenu.Label class="text-muted-foreground text-xs">Teams</DropdownMenu.Label>
					{#if teams}
						{#each teams as team}
							{@const currentTeam = 'team' in team ? team.team : team}
							<DropdownMenu.Item
								onSelect={() => {
									dashboardStore.setActiveTeam(currentTeam);
								}}
								class="gap-2 p-2"
							>
								<div class="flex size-6 items-center justify-center rounded-md border">
									{currentTeam.name.charAt(0).toUpperCase()}
								</div>
								{currentTeam.name}
							</DropdownMenu.Item>
						{/each}
					{/if}
					<DropdownMenu.Separator />
					{#if user?.role.toLowerCase() === 'admin'}
						<a href="/dash/teams/create">
							<DropdownMenu.Item class="gap-2 p-2">
								<div
									class="flex size-6 items-center justify-center rounded-md border bg-transparent"
								>
									<PlusIcon class="size-4" />
								</div>
								<div class="text-muted-foreground font-medium">Add team</div>
							</DropdownMenu.Item>
						</a>
					{/if}
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</Sidebar.MenuItem>
	</Sidebar.Menu>
{:else if user && user.role.toLowerCase() == 'admin'}
	<a href="/dash/teams/create" class="w-full">
		<Button type="button" variant="secondary" class="w-full">
			<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"
				><path
					fill="currentColor"
					d="M480 480V128a32 32 0 0 1 64 0v352h352a32 32 0 1 1 0 64H544v352a32 32 0 1 1-64 0V544H128a32 32 0 0 1 0-64z"
				/></svg
			>
			Create a team
		</Button>
	</a>
{/if}