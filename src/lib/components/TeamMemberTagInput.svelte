<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';

	let {
		allUsers,
		selectedUserIds = $bindable(),
		invitedEmails = $bindable()
	} = $props<{
		allUsers: { id: string; name: string | null; email: string | null }[];
		selectedUserIds: string[];
		invitedEmails: string[];
	}>();

	let searchTerm = $state('');
	let filteredUsers = $state<typeof allUsers>([]);
	let showDropdown = $state(false);

	const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

	$effect(() => {
		if (searchTerm.length > 0) {
			filteredUsers = allUsers.filter(
				(user: { id: string; name: string | null; email: string | null }) =>
					!selectedUserIds.includes(user.id) &&
					((user.name && user.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
						(user.email && user.email.toLowerCase().includes(searchTerm.toLowerCase())))
			);
			showDropdown = true;
		} else {
			filteredUsers = [];
			showDropdown = false;
		}
	});

	function addUser(user: { id: string; name: string | null; email: string | null }) {
		if (!selectedUserIds.includes(user.id)) {
			selectedUserIds = [...selectedUserIds, user.id];
		}
		searchTerm = '';
		showDropdown = false;
	}

	function removeUser(userId: string) {
		selectedUserIds = selectedUserIds.filter((id: string) => id !== userId);
	}

	function addInvite(rawEmail: string) {
		const email = rawEmail.trim().toLowerCase();
		if (!EMAIL_REGEX.test(email)) return;

		// If the email already belongs to a known user, add them directly instead of inviting.
		const existingUser = allUsers.find(
			(user: { id: string; email: string | null }) => user.email?.toLowerCase() === email
		);
		if (existingUser) {
			addUser(existingUser);
			return;
		}

		if (!invitedEmails.includes(email)) {
			invitedEmails = [...invitedEmails, email];
		}
		searchTerm = '';
		showDropdown = false;
	}

	function removeInvite(email: string) {
		invitedEmails = invitedEmails.filter((e: string) => e !== email);
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter' && searchTerm.trim().length > 0) {
			event.preventDefault();
			addInvite(searchTerm);
			return;
		}
		if (
			event.key === 'Backspace' &&
			searchTerm === '' &&
			(invitedEmails.length > 0 || selectedUserIds.length > 0)
		) {
			event.preventDefault();
			if (invitedEmails.length > 0) {
				invitedEmails = invitedEmails.slice(0, -1);
			} else {
				selectedUserIds = selectedUserIds.slice(0, -1);
			}
		}
	}

	// Get full user objects for selected IDs to display names
	let selectedUsers = $derived(
		selectedUserIds
			.map((id: string) =>
				allUsers.find((user: { id: string; name: string | null; email: string | null }) => user.id === id)
			)
			.filter(
				(
					user: { id: string; name: string | null; email: string | null } | undefined
				): user is { id: string; name: string | null; email: string | null } => !!user
			)
	);

	let trimmedSearchTerm = $derived(searchTerm.trim());
	let canInviteSearchTerm = $derived(
		EMAIL_REGEX.test(trimmedSearchTerm) &&
			!invitedEmails.includes(trimmedSearchTerm.toLowerCase()) &&
			!filteredUsers.some(
				(user: { email: string | null }) =>
					user.email?.toLowerCase() === trimmedSearchTerm.toLowerCase()
			)
	);
</script>

<div class="relative">
	<Input
		type="text"
		placeholder="Search users or type an email to invite..."
		bind:value={searchTerm}
		onkeydown={handleKeyDown}
		onfocus={() => (showDropdown = true)}
		onblur={() => setTimeout(() => (showDropdown = false), 100)}
	/>

	{#if showDropdown && (filteredUsers.length > 0 || canInviteSearchTerm)}
		<ul
			class="absolute z-10 mt-1 w-full max-h-60 overflow-auto rounded-md border bg-background shadow-lg"
		>
			{#each filteredUsers as user (user.id)}
				<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
				<li
					class="cursor-pointer px-4 py-2 hover:bg-accent hover:text-accent-foreground"
					onmousedown={() => addUser(user)}
				>
					{user.name || user.email}
				</li>
			{/each}
			{#if canInviteSearchTerm}
				<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
				<li
					class="cursor-pointer px-4 py-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
					onmousedown={() => addInvite(searchTerm)}
				>
					Invite "{trimmedSearchTerm}"
				</li>
			{/if}
		</ul>
	{/if}

	<div class="mt-4 flex flex-wrap gap-2">
		{#each selectedUsers as user (user.id)}
			<div
				class="flex items-center rounded-full bg-primary px-3 py-1 text-sm text-primary-foreground"
			>
				{user.name || user.email}
				<Button
					variant="ghost"
					size="icon"
					class="ml-2 h-5 w-5"
					onclick={() => removeUser(user.id)}
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
		{#each invitedEmails as email (email)}
			<div
				class="flex items-center rounded-full border border-dashed border-primary px-3 py-1 text-sm italic text-muted-foreground"
			>
				{email} (pending)
				<Button
					variant="ghost"
					size="icon"
					class="ml-2 h-5 w-5"
					onclick={() => removeInvite(email)}
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
	<input type="hidden" name="userIds" value={JSON.stringify(selectedUserIds)} />
	<input type="hidden" name="invitedEmails" value={JSON.stringify(invitedEmails)} />
</div>
