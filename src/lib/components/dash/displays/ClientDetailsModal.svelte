<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import { tick, createEventDispatcher } from 'svelte';
	import type { ClientInfo } from '$lib/server/webSocketHandler';
	import type { DisplayClient } from '@prisma/client';

	let {
		open = $bindable(),
		client,
		displayId
	}: {
		open: boolean;
		client: ClientInfo | DisplayClient;
		displayId: number;
	} = $props();

	const dispatch = createEventDispatcher<{
		close: void;
		update: DisplayClient;
		delete: string;
	}>();

	let friendlyNameInput = $state('');
	let isEditingName = $state(false);
	let isDeletingClient = $state(false);
	let clientDebugEnabled = $state(false);
	let debugToggling = $state(false);
	let updateSending = $state(false);
	let refreshSending = $state(false);

	$effect(() => {
		if (client) {
			friendlyNameInput = client.friendlyName || '';
		}
		if (!open) {
			isEditingName = false;
		}
	});
</script>

<Dialog.Root
	bind:open
	onOpenChange={(isOpen) => {
		if (!isOpen) dispatch('close');
	}}
>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>Client Details</Dialog.Title>
			<Dialog.Description>
				{'ip' in client ? client.ip : client.lastKnownIp}
			</Dialog.Description>
		</Dialog.Header>
		<div class="space-y-4">
			<div class="space-y-2">
				<Label for="friendlyName">Friendly Name</Label>
				<form
					method="POST"
					action="?/setClientFriendlyName"
					use:enhance={() => {
						isEditingName = false;
						return async ({ result }) => {
							if (result.type === 'success' && result.data?.updatedClient) {
								dispatch('update', result.data.updatedClient as DisplayClient);
							}
						};
					}}
				>
					<input type="hidden" name="clientId" value={client.id} />
					<div class="flex items-center gap-2">
						{#if isEditingName}
							<Input
								id="friendlyName"
								name="name"
								bind:value={friendlyNameInput}
								onblur={(e) => e.currentTarget.form?.requestSubmit()}
								onkeydown={(e) => {
									if (e.key === 'Enter') {
										e.preventDefault();
										e.currentTarget.form?.requestSubmit();
									} else if (e.key === 'Escape') {
										isEditingName = false;
										friendlyNameInput = client.friendlyName || '';
									}
								}}
								placeholder="e.g., Lobby TV"
								class="flex-grow"
							/>
						{:else}
							<div
								class="flex h-9 flex-grow items-center truncate rounded-md border border-input bg-transparent px-3 py-2 text-sm"
							>
								{client.friendlyName || ('ip' in client ? client.ip : client.lastKnownIp)}
							</div>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								title="Edit Name"
								onclick={async () => {
									isEditingName = true;
									await tick();
									const inputEl = document.getElementById('friendlyName') as HTMLInputElement;
									inputEl?.focus();
									inputEl?.select();
								}}
							>
								<PencilIcon class="h-4 w-4" />
							</Button>
						{/if}
					</div>
				</form>
			</div>

			<ul class="space-y-1 text-sm text-muted-foreground">
				<li class="break-all"><strong>ID:</strong> {client.id}</li>
				<li class="break-all"><strong>User Agent:</strong> {client.userAgent}</li>
				{#if 'latency' in client}
					<li><strong>Latency:</strong> {client.latency?.toFixed(0) ?? 'N/A'} ms</li>
					<li>
						<strong>Joined:</strong>
						{new Date(client.timeJoined).toLocaleString()}
					</li>
				{:else}
					<li>
						<strong>Last Seen:</strong>
						{new Date(client.lastSeen).toLocaleString()}
					</li>
				{/if}
			</ul>
		</div>
		<Dialog.Footer class="flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
			<AlertDialog.Root bind:open={isDeletingClient}>
				<AlertDialog.Trigger>
					{#snippet child({ props })}
						<Button {...props} variant="destructive">Delete Client Record</Button>
					{/snippet}
				</AlertDialog.Trigger>
				<AlertDialog.Content>
					<AlertDialog.Header>
						<AlertDialog.Title>Are you sure?</AlertDialog.Title>
						<AlertDialog.Description>
							This will permanently delete this client record. The client can reconnect and create a new
							record. This cannot be undone.
						</AlertDialog.Description>
					</AlertDialog.Header>
					<AlertDialog.Footer>
						<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
						<AlertDialog.Action
							onclick={() =>
								(
									document.getElementById(`delete-client-form-${client.id}`) as HTMLFormElement
								)?.requestSubmit()}
							>Delete</AlertDialog.Action
						>
					</AlertDialog.Footer>
				</AlertDialog.Content>
			</AlertDialog.Root>

			<div class="flex flex-wrap justify-end gap-2">
				<form method="POST" action="?/toggleClientDebug" use:enhance={() => {
					debugToggling = true;
					return async () => {
						clientDebugEnabled = !clientDebugEnabled;
						debugToggling = false;
					};
				}}>
					<input type="hidden" name="displayId" value={displayId} />
					<input type="hidden" name="clientId" value={client.id} />
					<input type="hidden" name="enabled" value={String(!clientDebugEnabled)} />
					<Button type="submit" variant={clientDebugEnabled ? "default" : "outline"} size="sm" disabled={!('latency' in client) || debugToggling}>
						{#if debugToggling}<Loader2Icon class="mr-1 h-3 w-3 animate-spin" />{/if}
						{clientDebugEnabled ? 'Debug On' : 'Debug'}
					</Button>
				</form>
				<form method="POST" action="?/sendClientUpdate" use:enhance={() => {
					updateSending = true;
					return async () => { updateSending = false; };
				}}>
					<input type="hidden" name="displayId" value={displayId} />
					<input type="hidden" name="clientId" value={client.id} />
					<Button type="submit" variant="secondary" size="sm" disabled={!('latency' in client) || updateSending}>
						{#if updateSending}<Loader2Icon class="mr-1 h-3 w-3 animate-spin" />{/if}
						Update
					</Button>
				</form>
				<form method="POST" action="?/forceClientRefresh" use:enhance={() => {
					refreshSending = true;
					return async () => { refreshSending = false; };
				}}>
					<input type="hidden" name="displayId" value={displayId} />
					<input type="hidden" name="clientId" value={client.id} />
					<Button type="submit" variant="outline" size="sm" disabled={!('latency' in client) || refreshSending}>
						{#if refreshSending}<Loader2Icon class="mr-1 h-3 w-3 animate-spin" />{/if}
						Refresh
					</Button>
				</form>
			</div>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<form
	id="delete-client-form-{client.id}"
	class="hidden"
	method="POST"
	action="?/deleteClient"
	use:enhance={() => {
		return async ({ result }) => {
			if (result.type === 'success') {
				dispatch('delete', client.id);
			}
			open = false; // Close the modal
		};
	}}
>
	<input type="hidden" name="clientId" value={client.id} />
</form>