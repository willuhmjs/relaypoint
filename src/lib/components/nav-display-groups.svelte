<script lang="ts">
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import FolderIcon from '@lucide/svelte/icons/folder';
	import type { DisplayGroupWithRelations } from '$lib/stores/dashboardStore';

	const { displayGroups }: { displayGroups: DisplayGroupWithRelations[] } = $props();
</script>

<Sidebar.Group>
	<Sidebar.GroupLabel>Displays</Sidebar.GroupLabel>
	<Sidebar.Menu>
		{#if displayGroups?.length > 0}
			{#each displayGroups as group (group.id)}
				<Collapsible.Root class="group/collapsible">
					<Sidebar.MenuItem class="relative group-data-[collapsible=icon]:justify-center">
						<!-- The trigger is now the main button, which expands the content -->
						<Collapsible.Trigger class="w-full">
							{#snippet child({ props })}
								<Sidebar.MenuButton {...props}>
									<FolderIcon />
									<span class="group-data-[collapsible=icon]:hidden">{group.name}</span>
									<ChevronRightIcon
										class="ml-auto transition-transform duration-200 group-data-[collapsible=icon]:hidden group-data-[state=open]/collapsible:rotate-90"
									/>
								</Sidebar.MenuButton>
							{/snippet}
						</Collapsible.Trigger>
					</Sidebar.MenuItem>

					<!-- The content that gets expanded, showing the displays -->

					<Collapsible.Content>
						<Sidebar.MenuSub>
							{#each group.displays as display (display.id)}
								<Sidebar.MenuSubItem>
									<Sidebar.MenuSubButton>
										{#snippet child({ props })}
											<!-- Assuming displays have their own pages -->
											<a href={`/dash/displays/${display.id}`} {...props}>
												<span>{display.name}</span>
											</a>
										{/snippet}
									</Sidebar.MenuSubButton>
								</Sidebar.MenuSubItem>
							{/each}
						</Sidebar.MenuSub>
					</Collapsible.Content>
				</Collapsible.Root>
			{/each}
		{:else}
			<p class="subtle w-full p-1 text-center text-xs font-thin italic">No display groups</p>
		{/if}
	</Sidebar.Menu>
</Sidebar.Group>
