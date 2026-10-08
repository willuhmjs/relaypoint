<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import CheckCircle2Icon from '@lucide/svelte/icons/check-circle-2';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import type { ActionData } from './$types';
	import { invalidateAll } from '$app/navigation';

	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	// Import both custom input components
	import DisplayGroupTeamInput from '$lib/components/DisplayGroupTeamInput.svelte';
	import Displays from '$lib/components/Displays.svelte';
	import { getContext } from 'svelte';
	import type { Display, DisplayGroup, Team, User } from '@prisma/client';

	// Updated form type to include errors for displayIds
	type Form_T = ActionData & {
		data?: {
			name: string;
		};
		errors?: {
			name?: string[];
			teamIds?: string[];
			displayIds?: string[];
		};
	};

	const user = getContext<User | null>('user');
	const displays = getContext<Display[] | null>('displays');

	let { data, form }: { data: any; form: Form_T } = $props();

	// Destructure all necessary data, including allDisplays
	let displayGroup = $state<DisplayGroup>();
	let allTeams = $state<Team[]>([]);
	let allDisplays = $state<Display[]>([]);

	// State for all form fields
	let useSharedTimeline = $state(false);
	let name = $state('');
	let selectedTeamIds = $state<string[]>([]);
	let selectedDisplayIds = $state<string[]>([]); // Added state for displays
	let isCreateDisplayDialogOpen = $state(false);

	// Effect to initialize and update form state from loaded data
	$effect(() => {
		if (form?.success && form.data) {
			// Persist new name on successful form submission
			name = form.data.name;
		} else if (data.displayGroup) {
			// Initialize form state from the main data object
			useSharedTimeline = data.displayGroup.useSharedTimeline ?? false;
			name = data.displayGroup.name ?? '';
			selectedTeamIds = data.displayGroup.teams.map((team: { teamId: string }) => team.teamId);
		}

		displayGroup = data.displayGroup;
		allTeams = data.allTeams;
		allDisplays = data.allDisplays;
	});
</script>

<div class="flex h-full w-full content-between gap-4 p-4">
	<Card.Root class="w-full">
		<Card.Header>
			<Card.Title>Display Group Settings</Card.Title>
			<Card.Description>Manage your display group settings.</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-8">
			{#if displayGroup}
				<form
					method="POST"
					action="?/edit"
					use:enhance={() => {
						return async ({ result, update }) => {
							// First, apply the form result to the current page
							await update({ reset: false });
							// If the update was successful, invalidate all data to refresh the layout
							if (result.type === 'success') {
								await invalidateAll();
							}
						};
					}}
					class="space-y-6"
				>
					<div class="space-y-2">
						<Label for="name">Display Group Name</Label>
						<Input
							id="name"
							name="name"
							value={name}
							oninput={(e) => (name = e.currentTarget.value)}
							placeholder="e.g., Lobby Screens"
						/>
						{#if form?.errors?.name}
							<Alert.Root variant="destructive">
								<CircleAlertIcon class="size-4" />
								<Alert.Title>Error</Alert.Title>
								<Alert.Description>{form.errors.name[0]}</Alert.Description>
							</Alert.Root>
						{/if}
					</div>

					<div class="space-y-2">
						<Label for="teams">Associated Teams</Label>
						<DisplayGroupTeamInput {allTeams} bind:selectedTeamIds />
						{#if form?.errors?.teamIds}
							<Alert.Root variant="destructive">
								<CircleAlertIcon class="size-4" />
								<Alert.Title>Error</Alert.Title>
								<Alert.Description>{form.errors.teamIds[0]}</Alert.Description>
							</Alert.Root>
						{/if}
					</div>

					<div class="space-y-2 pt-2">
						<div class="flex items-center space-x-2">
							<Checkbox id="useSharedTimeline" name="useSharedTimeline" bind:checked={useSharedTimeline} />
							<Label
								for="useSharedTimeline"
								class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
							>
								Synchronize all presentations in this group
							</Label>
						</div>
						<p class="text-sm text-muted-foreground">
							When enabled, all displays in this group will share a single timeline, ensuring they
							are perfectly in sync. Changing this setting will reset the timeline for all
							displays in the group.
						</p>
					</div>

					{#if form?.success}
						<Alert.Root>
							<CheckCircle2Icon class="size-4" />
							<Alert.Title>{form.message || 'Display Group updated successfully.'}</Alert.Title>
						</Alert.Root>
					{/if}
					{#if form?.error}
						<Alert.Root variant="destructive">
							<CircleAlertIcon class="size-4" />
							<Alert.Title>Error</Alert.Title>
							<Alert.Description>{form.error}</Alert.Description>
						</Alert.Root>
					{/if}

					<Button type="submit">Save Changes</Button>
				</form>

				<div class="space-y-4 border-t pt-6">
					<div class="space-y-2">
						<h3 class="font-semibold">Immediate Actions</h3>
						<p class="text-sm text-muted-foreground">
							These actions take effect immediately and will impact all displays in the group.
						</p>
					</div>
					<form method="POST" action="?/restartGroup" use:enhance>
						<Button type="submit" variant="secondary">Restart All Displays in Group</Button>
					</form>
				</div>

				<div class="border-destructive bg-destructive/5 space-y-4 rounded-lg border p-4">
					<div class="space-y-2">
						<h3 class="font-semibold">Danger Zone</h3>
						<p class="text-muted-foreground text-sm">
							Deleting a display group is a permanent action and cannot be undone.
						</p>
					</div>
					<form
						method="POST"
						action="?/delete"
						onsubmit={(e) => {
							if (
								!confirm(
									'Are you sure you want to delete this display group? This action is permanent.'
								)
							) {
								e.preventDefault();
							}
						}}
					>
						<Button variant="destructive" type="submit">Delete Display Group</Button>
					</form>
				</div>
			{:else}
				<p>Display Group not found.</p>
			{/if}
		</Card.Content>
	</Card.Root>

	<Card.Root class="max-w w-full">
		<Card.Header>
			<div class="max-w flex w-full content-center items-center justify-between gap-1">
				<Card.Title>Displays</Card.Title>
				<Dialog.Root bind:open={isCreateDisplayDialogOpen}>
					<Dialog.Trigger>
						<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 20 20"
							><path
								fill="currentColor"
								d="M2 6.75A2.75 2.75 0 0 1 4.75 4h10.5A2.75 2.75 0 0 1 18 6.75v3.507a5.5 5.5 0 0 0-1-.657V6.75A1.75 1.75 0 0 0 15.25 5H4.75A1.75 1.75 0 0 0 3 6.75v6.5c0 .966.784 1.75 1.75 1.75h4.272q.047.516.185 1H4.75A2.75 2.75 0 0 1 2 13.25zm17 7.75a4.5 4.5 0 1 1-9 0a4.5 4.5 0 0 1 9 0m-4-2a.5.5 0 0 0-1 0V14h-1.5a.5.5 0 0 0 0 1H14v1.5a.5.5 0 0 0 1 0V15h1.5a.5.5 0 0 0 0-1H15z"
							/></svg
						>
					</Dialog.Trigger>
					<Dialog.Content>
						<Dialog.Header>
							<Dialog.Title>New Display</Dialog.Title>
							<Dialog.Description>
								Enter the properties of your new display here.
							</Dialog.Description>
						</Dialog.Header>
						<form
							method="POST"
							action="?/createDisplay"
							use:enhance={({ formElement }) => {
								return async ({ result, update }) => {
									await update({ reset: false });
									if (result.type === 'success') {
										location.reload();
									}
								};
							}}
						>
							<div class="grid gap-4 py-4">
								<div class="grid grid-cols-4 items-center gap-4">
									<Label for="name" class="text-right">Name</Label>
									<Input id="name" name="name" placeholder="Reception" class="col-span-3" />
								</div>
								<div class="grid grid-cols-4 items-center gap-4">
									<Label for="description" class="text-right">Description</Label>
									<Input
										id="description"
										name="description"
										placeholder="TV outside reception"
										class="col-span-3"
									/>
								</div>

								<Button type="submit" class="pt-3">
									Save
								</Button>
							</div>
						</form>
					</Dialog.Content>
				</Dialog.Root>
			</div>
		</Card.Header>
		<Card.Content>
			<Displays displays={allDisplays} />
		</Card.Content>
	</Card.Root>
</div>