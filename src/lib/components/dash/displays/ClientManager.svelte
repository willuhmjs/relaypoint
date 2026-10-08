<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Tabs from '$lib/components/ui/tabs';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { Badge } from '$lib/components/ui/badge';
	import WifiIcon from '@lucide/svelte/icons/wifi';
	import WifiOffIcon from '@lucide/svelte/icons/wifi-off';
	import type { ClientInfo } from '$lib/server/webSocketHandler';
	import type { DisplayClient } from '@prisma/client';
	import { buttonVariants } from '$lib/components/ui/button';
	import ClientDetailsModal from './ClientDetailsModal.svelte';

	let { displayId }: { displayId: number } = $props();

	let connectedClients = $state<ClientInfo[]>([]);
	let historyClients = $state<DisplayClient[]>([]);
	let historyTotal = $state(0);
	let listModalOpen = $state(false);
	let selectedClient = $state<ClientInfo | DisplayClient | null>(null);
	let detailsModalOpen = $state(false);
	let isClearingHistory = $state(false);

	onMount(() => {
		const fetchClients = async () => {
			try {
				const res = await fetch(`/dash/displays/${displayId}/clients`);
				if (res.ok) {
					const clientData = await res.json();
					connectedClients = clientData.connected;
					historyClients = clientData.history;
					historyTotal = clientData.historyTotal ?? clientData.history.length;
				} else {
					console.error('Failed to fetch clients:', res.statusText);
				}
			} catch (e) {
				console.error('Error fetching clients:', e);
			}
		};
		fetchClients();
		const interval = setInterval(fetchClients, 5000); // Poll every 5 seconds
		return () => clearInterval(interval);
	});

	$effect(() => {
		if (selectedClient) {
			detailsModalOpen = true;
		}
	});

	function handleClientUpdate(updatedClient: DisplayClient) {
		const updateList = (list: (ClientInfo | DisplayClient)[]) =>
			list.map((c) => (c.id === updatedClient.id ? { ...c, ...updatedClient } : c));

		connectedClients = updateList(connectedClients) as ClientInfo[];
		historyClients = updateList(historyClients) as DisplayClient[];

		if (selectedClient && selectedClient.id === updatedClient.id) {
			selectedClient = { ...selectedClient, ...updatedClient };
		}
	}

	function handleClientDelete(clientId: string) {
		connectedClients = connectedClients.filter((c) => c.id !== clientId);
		historyClients = historyClients.filter((c) => c.id !== clientId);
		historyTotal = Math.max(0, historyTotal - 1);
		selectedClient = null;
	}
</script>

<Button variant="outline" onclick={() => (listModalOpen = true)}>
	{#if connectedClients.length > 0}
		<WifiIcon class="mr-2 h-4 w-4 text-blue-500" />
	{:else}
		<WifiOffIcon class="mr-2 h-4 w-4 text-red-500" />
	{/if}
	Connected Clients
	<Badge variant={connectedClients.length === 0 ? 'destructive' : 'info'} class="ml-2">
		{connectedClients.length}
	</Badge>
</Button>

<Dialog.Root bind:open={listModalOpen}>
	<Dialog.Content class="sm:max-w-[625px]">
		<Dialog.Header>
			<Dialog.Title>Display Clients</Dialog.Title>
			<Dialog.Description>
				Manage clients that are connected or have connected in the past.
			</Dialog.Description>
		</Dialog.Header>
		<Tabs.Root value="connected" class="w-full">
			<Tabs.List class="grid w-full grid-cols-2">
				<Tabs.Trigger value="connected">Connected</Tabs.Trigger>
				<Tabs.Trigger value="history">History</Tabs.Trigger>
			</Tabs.List>
			<Tabs.Content value="connected">
				<div class="mt-4 max-h-96 min-h-48 overflow-y-auto">
					{#if connectedClients.length > 0}
						<ul class="space-y-2 p-1">
							{#each connectedClients as client (client.id)}
								<li>
									<button
										class="flex w-full items-center gap-4 rounded-md p-2 text-left hover:bg-accent"
										onclick={() => {
											selectedClient = client;
											listModalOpen = false;
										}}
									>
										<div>
											<p class="font-semibold">{client.friendlyName || client.ip}</p>
											<p class="text-sm text-muted-foreground">
												{client.os.name} {client.os.version} &bull; {client.browser.name}
											</p>
										</div>
									</button>
								</li>
							{/each}
						</ul>
					{:else}
						<div class="flex h-48 items-center justify-center">
							<p class="text-sm text-muted-foreground">No clients currently connected.</p>
						</div>
					{/if}
				</div>
			</Tabs.Content>
			<Tabs.Content value="history">
				<div class="mt-4 max-h-96 min-h-48 overflow-y-auto">
					{#if historyClients.length > 0}
						<ul class="space-y-2 p-1">
							{#each historyClients as client (client.id)}
								<li>
									<button
										class="flex w-full items-center gap-4 rounded-md p-2 text-left hover:bg-accent"
										onclick={() => {
											selectedClient = client;
											listModalOpen = false;
										}}
									>
										<div>
											<p class="font-semibold">{client.friendlyName || client.lastKnownIp}</p>
											<p class="text-sm text-muted-foreground">
												Last seen: {new Date(client.lastSeen).toLocaleString()}
											</p>
										</div>
									</button>
								</li>
							{/each}
						</ul>
						{#if historyTotal > historyClients.length}
							<p class="p-2 text-center text-xs text-muted-foreground">
								Showing the {historyClients.length} most recent of {historyTotal} records.
							</p>
						{/if}
					{:else}
						<div class="flex h-48 items-center justify-center">
							<p class="text-sm text-muted-foreground">No client history.</p>
						</div>
					{/if}
				</div>
				{#if historyClients.length > 0}
					<div class="mt-4 border-t pt-4">
						<AlertDialog.Root bind:open={isClearingHistory}>
							<AlertDialog.Trigger>
								{#snippet child({ props })}
									<Button {...props} variant="destructive">
										Clear All History ({historyTotal})
									</Button>
								{/snippet}
							</AlertDialog.Trigger>
							<AlertDialog.Content class="sm:max-w-[425px]">
								<AlertDialog.Header>
									<AlertDialog.Title>Are you sure?</AlertDialog.Title>
									<AlertDialog.Description>
										This will permanently delete all {historyTotal} historical client
										records for this display. This action cannot be undone.
									</AlertDialog.Description>
								</AlertDialog.Header>
								<AlertDialog.Footer>
									<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
									<AlertDialog.Action
										onclick={() =>
											(
												document.getElementById('clear-history-form') as HTMLFormElement
											)?.requestSubmit()}
										>Clear History</AlertDialog.Action
									>
								</AlertDialog.Footer>
							</AlertDialog.Content>
						</AlertDialog.Root>
					</div>
				{/if}
			</Tabs.Content>
		</Tabs.Root>
	</Dialog.Content>
</Dialog.Root>

<form id="clear-history-form" class="hidden" method="POST" action="?/clearClientHistory" use:enhance>
	<input type="hidden" name="displayId" value={displayId} />
</form>

{#if selectedClient}
	<ClientDetailsModal
		bind:open={detailsModalOpen}
		client={selectedClient}
		{displayId}
		on:close={() => (selectedClient = null)}
		on:update={(e) => handleClientUpdate(e.detail)}
		on:delete={(e) => handleClientDelete(e.detail)}
	/>
{/if}