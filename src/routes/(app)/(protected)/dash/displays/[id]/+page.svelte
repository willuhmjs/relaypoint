<script lang="ts">
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import AlertTriangleIcon from '@lucide/svelte/icons/alert-triangle';

	import ClientManager from '$lib/components/dash/displays/ClientManager.svelte';
	import DisplaySettings from '$lib/components/dash/displays/DisplaySettings.svelte';

	import SlideManager from '$lib/components/dash/displays/SlideManager.svelte';

	let { data, form } = $props();
</script>

<div class="space-y-8 p-4 md:p-8">
	{#if form?.success && form?.warning}
		<Alert variant="destructive">
			<AlertTriangleIcon class="h-4 w-4" />
			<AlertTitle>Upload Warning</AlertTitle>
			<AlertDescription>
				{form.warning}
			</AlertDescription>
		</Alert>
	{/if}

	<div class="flex flex-wrap items-center justify-between gap-4">
		<h1 class="text-3xl font-bold">Manage Display: {data.display.name}</h1>
		<ClientManager displayId={data.display.id} />
	</div>

	<div class="grid gap-4">
		<DisplaySettings display={data.display} slides={data.display.slides} {form} />
	</div>

	<SlideManager displayId={data.display.id} slides={data.display.slides} />
</div>

<style>
	:global(.duration-input) {
		cursor: ns-resize;
		-moz-appearance: textfield;
		appearance: textfield;
	}

	:global(.duration-input::-webkit-outer-spin-button),
	:global(.duration-input::-webkit-inner-spin-button) {
		-webkit-appearance: none;
		margin: 0;
	}
</style>