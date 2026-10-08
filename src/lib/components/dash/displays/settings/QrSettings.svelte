<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import type { Display } from '@prisma/client';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import { enhance } from '$app/forms';

	let { display, open = $bindable() } = $props<{ display: Display; open: boolean }>();

	let loading = $state(false);
	// Ensure showQrCode defaults to false if it's null/undefined, and correctly reflects the display prop
	let showQrCode = $state(display.showQrCode ?? false);

	$effect(() => {
		showQrCode = display.showQrCode ?? false;
	});
</script>

<Dialog.Header>
	<Dialog.Title>Footer Settings</Dialog.Title>
	<Dialog.Description>
		Manage the visibility of the footer on the display.
	</Dialog.Description>
</Dialog.Header>

<form
	method="POST"
	action="?/updateSettings"
	use:enhance={() => {
		loading = true;
		return async ({ result, update }) => {
			loading = false;
			if (result.type === 'success') {
				await update();
				open = false;
			}
		};
	}}
	class="grid gap-4 py-4"
>
	<input type="hidden" name="id" value={display.id} />
	
	<!-- Preserve other settings that this form action expects, similar to TransitionSettings.svelte -->
	<input type="hidden" name="transitionType" value={display.transitionType} />
	<input type="hidden" name="transitionDuration" value={display.transitionDuration} />

	<div class="flex flex-row items-center justify-between rounded-lg border p-4">
		<div class="max-w-[80%] space-y-0.5">
			<Label class="text-base">Show QR Code</Label>
			<div class="text-sm text-muted-foreground">
				Display a QR code footer for easy access to the mobile view.
			</div>
		</div>
		<Switch bind:checked={showQrCode} />
		<input type="hidden" name="showQrCode" value={showQrCode.toString()} />
	</div>

	<Dialog.Footer>
		<Button type="submit" disabled={loading}>
			{#if loading}
				<Loader2Icon class="mr-2 h-4 w-4 animate-spin" />
			{/if}
			Save changes
		</Button>
	</Dialog.Footer>
</form>
