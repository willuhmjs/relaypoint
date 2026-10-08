<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import type { Display, Slide } from '@prisma/client';
	import JSZip from 'jszip';

	import TransitionSettings from './settings/TransitionSettings.svelte';
	import DurationSettings from './settings/DurationSettings.svelte';
	import UploadSettings from './settings/UploadSettings.svelte';
	import AssetSettings from './settings/AssetSettings.svelte';
	import QrSettings from './settings/QrSettings.svelte';

	let {
		display,
		slides,
		form
	}: {
		display: Display & { assets: any[]; presentationSources?: any[] };
		slides: Slide[];
		form: any;
	} = $props();

	let transitionDialogOpen = $state(false);
	let durationDialogOpen = $state(false);
	let uploadDialogOpen = $state(false);
	let assetDialogOpen = $state(false);
	let qrDialogOpen = $state(false);
	let deleteAllSlidesDialogOpen = $state(false);

	async function downloadAsZip() {
		const zip = new JSZip();

		// Add slides to zip
		for (const slide of slides) {
			const response = await fetch(`/content/${slide.contentUrl}`);
			const blob = await response.blob();
			const filename = slide.contentUrl.split('/').pop();
			zip.file(`slides/${filename}`!, blob);
		}

		// Add assets to zip
		for (const asset of display.assets) {
			const response = await fetch(`/content/${asset.s3Path}`);
			const blob = await response.blob();
			zip.file(`assets/${asset.filename}`!, blob);
		}

		// Add settings.json
		const settings = {
			display: {
				transitionType: display.transitionType,
				transitionDuration: display.transitionDuration
			},
			slides: slides.map((slide) => ({
				filename: slide.contentUrl.split('/').pop(),
				duration: slide.duration,
				order: slide.order,
				isHidden: slide.isHidden,
				type: slide.type,
				linkUrl: slide.linkUrl
			}))
		};
		zip.file('settings.json', JSON.stringify(settings, null, 2));

		const zipBlob = await zip.generateAsync({ type: 'blob' });

		const link = document.createElement('a');
		link.href = URL.createObjectURL(zipBlob);
		link.download = `${display.name.replace(/\s+/g, '_')}_${new Date().toISOString()}.zip`;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Display Settings</Card.Title>
		<Card.Description>Configure global settings for this display.</Card.Description>
	</Card.Header>
	<Card.Content class="flex flex-wrap gap-2">
		<Dialog.Root bind:open={transitionDialogOpen}>
			<Dialog.Trigger class={buttonVariants({ variant: 'outline' })}>Set Transition</Dialog.Trigger>
			<Dialog.Content class="sm:max-w-[425px]">
				<TransitionSettings {display} bind:open={transitionDialogOpen} />
			</Dialog.Content>
		</Dialog.Root>

		<Dialog.Root bind:open={durationDialogOpen}>
			<Dialog.Trigger class={buttonVariants({ variant: 'outline' })}>Set Duration</Dialog.Trigger>
			<Dialog.Content class="sm:max-w-[425px]">
				<DurationSettings {display} {slides} bind:open={durationDialogOpen} />
			</Dialog.Content>
		</Dialog.Root>

		<Dialog.Root bind:open={uploadDialogOpen}>
			<Dialog.Trigger class={buttonVariants({ variant: 'outline' })}>
				Upload Presentation
			</Dialog.Trigger>
			<Dialog.Content class="sm:max-w-[425px]">
				<UploadSettings displayId={display.id} {slides} {form} bind:open={uploadDialogOpen} />
			</Dialog.Content>
		</Dialog.Root>

		<Dialog.Root bind:open={assetDialogOpen}>
			<Dialog.Trigger class={buttonVariants({ variant: 'outline' })}>Manage Assets</Dialog.Trigger>
			<Dialog.Content class="max-w-3xl">
				<AssetSettings {display} bind:open={assetDialogOpen} />
			</Dialog.Content>
		</Dialog.Root>

		<Dialog.Root bind:open={qrDialogOpen}>
			<Dialog.Trigger class={buttonVariants({ variant: 'outline' })}>Footer Settings</Dialog.Trigger>
			<Dialog.Content class="sm:max-w-[425px]">
				<QrSettings {display} bind:open={qrDialogOpen} />
			</Dialog.Content>
		</Dialog.Root>

		<Button variant="outline" type="button" onclick={downloadAsZip}>Save as .zip</Button>

		{#if display.presentationSources && display.presentationSources.length > 0}
			<Button
				variant="outline"
				href={`/api/displays/${display.id}/presentation-source`}
				target="_blank"
			>
				Download Original File{display.presentationSources.length > 1 ? 's' : ''}
			</Button>
		{/if}

		<Dialog.Root bind:open={deleteAllSlidesDialogOpen}>
			<Dialog.Trigger class={buttonVariants({ variant: 'destructive' })}>
				Delete All Slides
			</Dialog.Trigger>
			<Dialog.Content class="sm:max-w-[425px]">
				<Dialog.Header>
					<Dialog.Title>Are you sure?</Dialog.Title>
					<Dialog.Description>
						This will permanently delete all slides for this display. This action cannot be undone.
					</Dialog.Description>
				</Dialog.Header>
				<Dialog.Footer>
					<Dialog.Close class={buttonVariants({ variant: 'outline' })}>Cancel</Dialog.Close>
					<form
						method="POST"
						action="?/deleteAllSlides"
						use:enhance={() => {
							return async ({ update }) => {
								await update({ reset: false });
								deleteAllSlidesDialogOpen = false;
							};
						}}
						class="contents"
					>
						<Button type="submit" variant="destructive">Yes, delete all slides</Button>
					</form>
				</Dialog.Footer>
			</Dialog.Content>
		</Dialog.Root>
	</Card.Content>
</Card.Root>