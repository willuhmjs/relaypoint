<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';

	// The props are now typed for teams instead of users
	let { allTeams, selectedTeamIds = $bindable() } = $props<{
		allTeams: { id: string; name: string }[];
		selectedTeamIds: string[];
	}>();

	let searchTerm = $state('');
	let filteredTeams = $state<{ id: string; name: string }[]>([]);
	let showDropdown = $state(false);

	$effect(() => {
		if (searchTerm.length > 0) {
			// Filter logic is simplified to only search by team name
			filteredTeams = allTeams.filter((team: { id: string; name: string }) =>
				team.name.toLowerCase().includes(searchTerm.toLowerCase())
			);
			showDropdown = true;
		} else {
			filteredTeams = [];
			showDropdown = false;
		}
	});

	function addTeam(team: { id: string; name: string }) {
		if (!selectedTeamIds.includes(team.id)) {
			selectedTeamIds = [...selectedTeamIds, team.id];
		}
		searchTerm = '';
		showDropdown = false;
	}

	function removeTeam(teamId: string) {
		selectedTeamIds = selectedTeamIds.filter((id: string) => id !== teamId);
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Backspace' && searchTerm === '' && selectedTeamIds.length > 0) {
			event.preventDefault();
			// Remove the last selected team on backspace
			selectedTeamIds = selectedTeamIds.slice(0, -1);
		}
	}

	// Get full team objects for selected IDs to display their names in tags
	let selectedTeams = $derived(
		selectedTeamIds
			.map((id: string) => allTeams.find((team: { id: string; name: string }) => team.id === id))
			.filter((team: { id: string; name: string } | undefined): team is { id: string; name: string } => !!team)
	);
</script>

<div class="relative">
	<Input
		type="text"
		placeholder="Search teams..."
		bind:value={searchTerm}
		onkeydown={handleKeyDown}
		onfocus={() => (showDropdown = true)}
		onblur={() => setTimeout(() => (showDropdown = false), 100)}
	/>

	{#if showDropdown && filteredTeams.length > 0}
		<ul
			class="absolute z-10 mt-1 w-full max-h-60 overflow-auto rounded-md border bg-background shadow-lg"
		>
			{#each filteredTeams as team (team.id)}
				<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
				<li
					class="cursor-pointer px-4 py-2 hover:bg-accent hover:text-accent-foreground"
					onmousedown={() => addTeam(team)}
				>
					{team.name}
				</li>
			{/each}
		</ul>
	{/if}

	<div class="mt-4 flex flex-wrap gap-2">
		{#each selectedTeams as team (team.id)}
			<div
				class="flex items-center rounded-full bg-primary px-3 py-1 text-sm text-primary-foreground"
			>
				{team.name}
				<Button
					variant="ghost"
					size="icon"
					class="ml-2 h-5 w-5"
					onclick={() => removeTeam(team.id)}
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
						><path
							fill="currentColor"
							d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12z"
						/></svg
					>
				</Button>
			</div>
		{/each}
	</div>

	<!-- This hidden input is critical for form submission. Note the name is "teamIds". -->
	<input type="hidden" name="teamIds" value={JSON.stringify(selectedTeamIds)} />
</div>