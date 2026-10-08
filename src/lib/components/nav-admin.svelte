<script lang="ts">
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { useSidebar } from '$lib/components/ui/sidebar/context.svelte.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import FolderIcon from '@lucide/svelte/icons/folder';
	import ForwardIcon from '@lucide/svelte/icons/forward';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import type { DisplayGroup } from '@prisma/client';
	import type { User } from '@prisma/client';
	import { getContext } from 'svelte';
	import Button from './ui/button/button.svelte';
	import { page } from '$app/stores';
	import type { Team } from '@prisma/client';

	const user = getContext<User | null>('user');

	const { displayGroups, teams }: { displayGroups: DisplayGroup[]; teams: any } = $props();

	// let user = $props();
	const sidebar = useSidebar();
</script>

<Sidebar.Group>
	<Sidebar.GroupLabel>Management</Sidebar.GroupLabel>
	<Sidebar.Menu>
		{#if user?.role.toLowerCase() == 'admin'}
			<Collapsible.Root class="group/collapsible">
				<Sidebar.MenuItem class="relative group-data-[collapsible=icon]:justify-center">
					<Collapsible.Trigger class="w-full">
						{#snippet child({ props })}
							<Sidebar.MenuButton {...props}>
								<FolderIcon />
								<span class="group-data-[collapsible=icon]:hidden">Teams</span>
								<ChevronRightIcon
									class="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90 group-data-[collapsible=icon]:hidden"
								/>
							</Sidebar.MenuButton>
						{/snippet}
					</Collapsible.Trigger>
				</Sidebar.MenuItem>
				<Collapsible.Content>
					<Sidebar.MenuSub>
						{#if teams}
							{#each teams as team (team.id)}
								<Sidebar.MenuSubItem>
									<Sidebar.MenuSubButton href="/dash/teams/{team.id}">
										<span>{team.name}</span>
									</Sidebar.MenuSubButton>
								</Sidebar.MenuSubItem>
							{/each}
						{/if}
					</Sidebar.MenuSub>

					<Button type="button" variant="outline" class="w-full" size="sm" href="/dash/teams/create">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="1024"
							height="1024"
							viewBox="0 0 1024 1024"
							><path
								fill="currentColor"
								d="M480 480V128a32 32 0 0 1 64 0v352h352a32 32 0 1 1 0 64H544v352a32 32 0 1 1-64 0V544H128a32 32 0 0 1 0-64z"
							/></svg
						>
						Create a team
					</Button>
				</Collapsible.Content>
			</Collapsible.Root>

			<Collapsible.Root class="group/collapsible">
				<Sidebar.MenuItem class="relative group-data-[collapsible=icon]:justify-center">
					<Collapsible.Trigger class="w-full">
						{#snippet child({ props })}
							<Sidebar.MenuButton {...props}>
								<FolderIcon />
								<span class="group-data-[collapsible=icon]:hidden">Display Groups</span>
								<ChevronRightIcon
									class="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90 group-data-[collapsible=icon]:hidden"
								/>
							</Sidebar.MenuButton>
						{/snippet}
					</Collapsible.Trigger>
				</Sidebar.MenuItem>
				<Collapsible.Content>
					<Sidebar.MenuSub>
						{#if displayGroups}
							{#each displayGroups as group (group.id)}
								<Sidebar.MenuSubItem>
									<Sidebar.MenuSubButton href="/dash/groups/{group.id}">
										<span>{group.name}</span>
									</Sidebar.MenuSubButton>
								</Sidebar.MenuSubItem>
							{/each}
						{/if}
					</Sidebar.MenuSub>

					<Button type="button" variant="outline" class="w-full" size="sm" href="/dash/groups/create">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="1024"
							height="1024"
							viewBox="0 0 1024 1024"
							><path
								fill="currentColor"
								d="M480 480V128a32 32 0 0 1 64 0v352h352a32 32 0 1 1 0 64H544v352a32 32 0 1 1-64 0V544H128a32 32 0 0 1 0-64z"
							/></svg
						>
						Create a display group
					</Button>
				</Collapsible.Content>
			</Collapsible.Root>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton isActive={$page.url.pathname.startsWith('/dash/apk')}>
					{#snippet child({ props })}
						<a href="/dash/apk" {...props}>
							<FolderIcon />
							<span>APK Management</span>
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		{/if}
	</Sidebar.Menu>
</Sidebar.Group>
