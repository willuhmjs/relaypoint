<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import type { ActionData } from './$types';
	import { dashboardStore } from '$lib/stores/dashboardStore';
	import TeamMemberTagInput from '$lib/components/TeamMemberTagInput.svelte';

	type Form_T = ActionData & {
		data?: {
			name: string;
		};
		errors?: {
			name?: string[];
			userIds?: string[];
			invitedEmails?: string[];
		};
	};

	let { data, form }: { data: any; form: Form_T } = $props();
	const team = data.team;
	const allUsers = data.allUsers;

	let name = $state('');
	let selectedUserIds = $state<string[]>([]);
	let invitedEmails = $state<string[]>([]);

	$effect(() => {
		if (form?.success && form.data) {
			name = form.data.name;
		} else if (data.team) {
			name = data.team.name ?? '';
			const nonAdminUserIds = allUsers.map((u: { id: string }) => u.id);
			selectedUserIds = data.team.users
				.map((user: { userId: string }) => user.userId)
				.filter((id: string) => nonAdminUserIds.includes(id));
			invitedEmails = data.team.invites.map((invite: { email: string }) => invite.email);
		}
	});

	$effect(() => {
		if (data.team) {
			dashboardStore.setActiveTeam(data.team);
		}
	});
</script>

<div class="flex h-full w-full content-between gap-4 p-4">
	<Card.Root class="w-full">
		<Card.Header>
			<Card.Title>Team Settings</Card.Title>
			<Card.Description>Manage your team settings. </Card.Description>
		</Card.Header>
		<Card.Content class="space-y-8">
			{#if team}
				<form
					method="POST"
					action="?/edit"
					use:enhance={() => {
						return async ({ update }) => {
							await update({ reset: false });
						};
					}}
					class="space-y-6"
				>
					<div class="space-y-2">
						<Label for="name">Team Name</Label>
						<Input
							id="name"
							name="name"
							value={name}
							oninput={(e) => (name = e.currentTarget.value)}
							placeholder="e.g., Marketing Team"
						/>
						{#if form?.errors?.name}
							<p class="text-sm font-medium text-red-600">{form.errors.name[0]}</p>
						{/if}
					</div>

					<div class="space-y-2">
						<Label for="users">Team Members</Label>
						<TeamMemberTagInput {allUsers} bind:selectedUserIds bind:invitedEmails />
						<p class="text-xs text-muted-foreground">
							Type an email address and press Enter to invite someone who hasn't signed in yet.
							They'll be added to this team automatically the first time they sign in.
						</p>
						{#if form?.errors?.userIds}
							<p class="text-sm font-medium text-red-600">{form.errors.userIds[0]}</p>
						{/if}
						{#if form?.errors?.invitedEmails}
							<p class="text-sm font-medium text-red-600">{form.errors.invitedEmails[0]}</p>
						{/if}
					</div>

					{#if form?.success}
						<p class="text-sm font-medium text-green-600">
							{form.message || 'Team updated successfully.'}
						</p>
					{/if}
					{#if form?.error && form.message !== 'Team updated successfully.'}
						<p class="text-sm font-medium text-red-600">{form.error}</p>
					{/if}

					<Button type="submit">Save Changes</Button>
				</form>

				<div class="space-y-4 rounded-lg border border-destructive bg-destructive/5 p-4">
					<div class="space-y-2">
						<h3 class="font-semibold">Danger Zone</h3>
						<p class="text-sm text-muted-foreground">
							Deleting a team is a permanent action and cannot be undone.
						</p>
					</div>
					<form
						method="POST"
						action="?/delete"
						onsubmit={(e) => {
							if (!confirm('Are you sure you want to delete this team? This action is permanent.')) {
								e.preventDefault();
							}
						}}
					>
						<Button variant="destructive" type="submit">Delete Team</Button>
					</form>
				</div>
			{:else}
				<p>Team not found.</p>
			{/if}
		</Card.Content>
	</Card.Root>
</div>