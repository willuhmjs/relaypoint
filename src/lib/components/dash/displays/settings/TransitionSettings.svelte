<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select/index.js';
	import type { Display } from '@prisma/client';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { transitions, type TransitionType } from '$lib/transitions';
	import { Input } from '$lib/components/ui/input';
	import { Checkbox } from '$lib/components/ui/checkbox';

	let { display, open = $bindable() } = $props<{ display: Display; open: boolean }>();
	let selectedTransition = $state<TransitionType>(
		(display.transitionType as TransitionType) || 'slide'
	);
	let selectedDuration = $state(display.transitionDuration || 500);
	let showQrCode = $state(display.showQrCode ?? true);

	const labels = Object.fromEntries(
		Object.entries(transitions).map(([key, value]) => [key, value.label])
	);

	$effect(() => {
		selectedTransition = (display.transitionType as TransitionType) || 'slide';
		selectedDuration = display.transitionDuration || 500;
		showQrCode = display.showQrCode ?? true;
	});
</script>

<Dialog.Header>
	<Dialog.Title>Transition Effect</Dialog.Title>
	<Dialog.Description>Select a transition effect for the slides in this display.</Dialog.Description>
</Dialog.Header>
<form
	method="POST"
	action="?/updateSettings"
	use:enhance={() => {
		return async ({ update }) => {
			await update({ reset: false });
			open = false;
		};
	}}
	class="space-y-4 py-4"
>
	<input type="hidden" name="displayId" value={display.id} />
	<div class="space-y-2">
		<Label for="transitionType">Transition Effect</Label>
		<Select.Root type="single" name="transitionType" bind:value={selectedTransition}>
			<Select.Trigger class="w-full">
				{labels[selectedTransition] ?? 'Select a transition'}
			</Select.Trigger>
			<Select.Content>
				{#each Object.entries(transitions) as [key, { label }]}
					<Select.Item value={key}>{label}</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>
	</div>
	<div class="space-y-2">
		<Label for="transitionDuration">Transition Duration (ms)</Label>
		<Input
			type="number"
			name="transitionDuration"
			bind:value={selectedDuration}
			placeholder="e.g., 500"
		/>
	</div>
	<!-- Hidden input to preserve showQrCode setting -->
	<input type="hidden" name="showQrCode" value={showQrCode.toString()} />
	<Dialog.Footer>
		<Button type="submit">Save</Button>
	</Dialog.Footer>
</form>