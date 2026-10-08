<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as ContextMenu from '$lib/components/ui/context-menu/index.js';
	import { toast } from 'svelte-sonner';
	import EyeOffIcon from '@lucide/svelte/icons/eye-off';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import LinkIcon from '@lucide/svelte/icons/link';
	import * as Dialog from '$lib/components/ui/dialog';
	import type { Slide } from '@prisma/client';
	import { createEventDispatcher } from 'svelte';

	let {
		slide,
		displayId
	}: { slide: Slide & { linkUrl?: string | null }; displayId: number } = $props();
	const dispatch = createEventDispatcher();

	let isLinkDialogOpen = $state(false);
	let isPreviewDialogOpen = $state(false);

	// --- Duration Drag State ---
	const debounceTimers = new Map<number, NodeJS.Timeout>();
	let isMouseDownOnDuration = $state(false);
	let isDraggingDuration = $state(false);
	let dragStartY = $state(0);
	let dragStartValue = $state(0);
	let dragForm = $state<HTMLFormElement | null>(null);

	function handleDurationMouseDown(event: MouseEvent) {
		if (debounceTimers.has(slide.id)) {
			clearTimeout(debounceTimers.get(slide.id));
			debounceTimers.delete(slide.id);
		}
		isMouseDownOnDuration = true;
		dragStartY = event.clientY;
		dragStartValue = slide.duration;
		dragForm = (event.currentTarget as HTMLElement).closest('form');
	}

	function handleGlobalMouseMove(event: MouseEvent) {
		if (!isMouseDownOnDuration) return;
		if (!isDraggingDuration && Math.abs(event.clientY - dragStartY) > 2) {
			isDraggingDuration = true;
			document.body.style.cursor = 'ns-resize';
			document.body.style.userSelect = 'none';
		}
		if (isDraggingDuration) {
			event.preventDefault();
			const deltaY = dragStartY - event.clientY;
			const sensitivity = 8;
			const newValue = Math.max(1, Math.round(dragStartValue + deltaY / sensitivity));
			if (slide.duration !== newValue) {
				slide.duration = newValue;
			}
		}
	}

	function handleGlobalMouseUp() {
		if (isDraggingDuration) {
			dragForm?.requestSubmit();
		}
		isMouseDownOnDuration = false;
		isDraggingDuration = false;
		dragForm = null;
		document.body.style.cursor = 'default';
		document.body.style.userSelect = 'auto';
	}

	function debounceDurationSave(event: Event) {
		const form = (event.currentTarget as HTMLInputElement).closest('form');
		if (!form) return;

		if (debounceTimers.has(slide.id)) {
			clearTimeout(debounceTimers.get(slide.id));
		}
		const newTimeoutId = setTimeout(() => {
			form.requestSubmit();
		}, 500);
		debounceTimers.set(slide.id, newTimeoutId);
	}

	$effect(() => {
		window.addEventListener('mousemove', handleGlobalMouseMove);
		window.addEventListener('mouseup', handleGlobalMouseUp);
		return () => {
			window.removeEventListener('mousemove', handleGlobalMouseMove);
			window.removeEventListener('mouseup', handleGlobalMouseUp);
		};
	});
</script>

<div class="group relative">
	<form
		id="delete-slide-form-{slide.id}"
		method="POST"
		action="?/deleteSlide"
		use:enhance={() => {
			return async ({ update }) => {
				await update({ reset: false });
			};
		}}
	>
		<input type="hidden" name="slideId" value={slide.id} />
	</form>

	<ContextMenu.Root>
		<ContextMenu.Trigger class="h-full w-full">
			<button
				class="bg-card relative aspect-video h-full w-full cursor-pointer rounded-lg border p-2 text-left transition-opacity {slide.isHidden
					? 'opacity-50'
					: 'opacity-100'}"
				onclick={() => (isPreviewDialogOpen = true)}
			>
				{#if slide.type === 'IMAGE'}
					<img
						src={`/content/${slide.contentUrl}`}
						alt="Slide {slide.order + 1}"
						class="h-full w-full rounded-md object-contain"
					/>
				{:else if slide.type === 'VIDEO'}
					<video
						src={`/content/${slide.contentUrl}`}
						class="h-full w-full rounded-md object-contain"
						controls={false}
						muted
					></video>
					<p class="absolute bottom-2 right-2 rounded bg-black/50 px-2 py-1 text-xs text-white">
						VIDEO
					</p>
				{:else if slide.type === 'HTML'}
					<div class="h-full w-full overflow-hidden rounded-md bg-white">
						<iframe
							src={`/content/${slide.contentUrl}`}
							class="pointer-events-none h-[400%] w-[400%] origin-top-left scale-[0.25] border-0"
							title="Slide {slide.order + 1} preview"
							sandbox="allow-scripts allow-same-origin"
						></iframe>
					</div>
					<p class="absolute bottom-2 right-2 rounded bg-black/50 px-2 py-1 text-xs text-white">
						HTML
					</p>
				{/if}
				{#if slide.isHidden}
					<div
						class="bg-background/70 absolute inset-0 flex items-center justify-center rounded-md"
					>
						<EyeOffIcon class="text-foreground h-10 w-10" />
					</div>
				{/if}
				<span
					class="bg-primary text-primary-foreground absolute left-2 top-2 rounded-full px-2 py-1 text-xs"
					>{slide.order + 1}</span
				>
			</button>
		</ContextMenu.Trigger>
		<ContextMenu.Content>
			<form method="POST" action="?/toggleVisibility" use:enhance>
				<input type="hidden" name="slideId" value={slide.id} />
				<ContextMenu.Item
					onclick={(e) => (e.currentTarget as HTMLElement).closest('form')?.requestSubmit()}
				>
					{slide.isHidden ? 'Show' : 'Hide'}
				</ContextMenu.Item>
			</form>
		</ContextMenu.Content>
	</ContextMenu.Root>

	<Button
		variant="outline"
		size="icon"
		class="absolute right-24 top-2 z-10 h-8 w-8 opacity-0 transition-opacity group-hover:bg-muted group-hover:opacity-100 hover:bg-muted dark:group-hover:bg-muted dark:hover:bg-muted"
		onclick={(e) => {
			e.stopPropagation();
			isLinkDialogOpen = true;
		}}
		title="Set Link URL"
	>
		<LinkIcon class="h-4 w-4" />
	</Button>

	<Button
		variant="destructive"
		size="icon"
		class="absolute right-2 top-2 z-10 h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100"
		onclick={(e) => {
			e.stopPropagation();
			dispatch('deleteRequest');
		}}
		title="Delete slide"
	>
		<Trash2Icon class="h-4 w-4" />
	</Button>

	<Button
		variant="outline"
		size="icon"
		href={`/content/${slide.contentUrl}?download=true`}
		download={slide.contentUrl.split('/').pop()}
		class="absolute right-12 top-2 z-10 h-8 w-8 opacity-0 transition-opacity group-hover:bg-muted group-hover:opacity-100 hover:bg-muted dark:group-hover:bg-muted dark:hover:bg-muted"
		title="Download slide"
		onclick={(e) => e.stopPropagation()}
	>
		<DownloadIcon class="h-4 w-4" />
	</Button>

	{#if slide.type !== 'VIDEO'}
		<form
			method="POST"
			action="?/updateSlideDuration"
			use:enhance={() => {
				return async ({ update }) => {
					await update({ reset: false });
				};
			}}
			class="absolute right-36 top-2 z-10 opacity-0 transition-opacity {isMouseDownOnDuration
				? '!opacity-100'
				: 'group-hover:opacity-100'}"
		>
			<input type="hidden" name="slideId" value={slide.id} />
			<div class="relative">
				<Input
					type="number"
					name="duration"
					bind:value={slide.duration}
					oninput={debounceDurationSave}
					onmousedown={handleDurationMouseDown}
					class="duration-input h-8 w-14 text-center group-hover:bg-muted dark:group-hover:bg-muted"
					min="1"
				/>
				<span
					class="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-muted-foreground"
					>s</span
				>
			</div>
		</form>
	{/if}
</div>

<Dialog.Root bind:open={isLinkDialogOpen}>
	<Dialog.Content class="sm:max-w-[425px]">
		<Dialog.Header>
			<Dialog.Title>Edit Slide Link</Dialog.Title>
			<Dialog.Description>
				Add a URL that will be opened when this slide is clicked on the display.
			</Dialog.Description>
		</Dialog.Header>
		<div class="grid gap-4 py-4">
			<div class="aspect-video w-full overflow-hidden rounded-md border bg-muted">
				{#if slide.type === 'IMAGE'}
					<img
						src={`/content/${slide.contentUrl}`}
						alt="Slide Preview"
						class="h-full w-full object-contain"
					/>
				{:else if slide.type === 'VIDEO'}
					<video
						src={`/content/${slide.contentUrl}`}
						class="h-full w-full object-contain"
						controls={false}
						muted
					></video>
				{:else if slide.type === 'HTML'}
					<div class="h-full w-full overflow-hidden bg-white">
						<iframe
							src={`/content/${slide.contentUrl}`}
							class="pointer-events-none h-[400%] w-[400%] origin-top-left scale-[0.25] border-0"
							title="Slide Preview"
							sandbox="allow-scripts allow-same-origin"
						></iframe>
					</div>
				{/if}
			</div>
			<div class="grid gap-2">
				<Label for="linkUrl">Link URL</Label>
				<form
					method="POST"
					action="?/updateSlideLink"
					use:enhance={() => {
						return async ({ result, update }) => {
							await update({ reset: false });
							if (result.type === 'success') {
								toast.success('Link saved successfully');
								isLinkDialogOpen = false;
							} else {
								toast.error('Failed to save link');
							}
						};
					}}
					class="flex items-center space-x-2"
				>
					<input type="hidden" name="slideId" value={slide.id} />
					<Input
						id="linkUrl"
						type="url"
						name="linkUrl"
						placeholder="https://example.com"
						value={slide.linkUrl || ''}
						class="col-span-3"
					/>
					<Button type="submit">Save</Button>
				</form>
			</div>
		</div>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={isPreviewDialogOpen}>
	<Dialog.Content class="sm:max-w-screen-md flex h-[80vh] flex-col overflow-hidden border-0 bg-background p-0 shadow-none">
		<Dialog.Title class="sr-only">Slide Preview</Dialog.Title>
		<Dialog.Description class="sr-only">Preview of the slide content.</Dialog.Description>
		
		<div class="flex shrink-0 items-center justify-between border-b p-3">
			<div class="flex items-center gap-3">
				<span class="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
					{slide.order + 1}
				</span>
				<span class="text-sm text-muted-foreground">{slide.duration}s</span>
				{#if slide.linkUrl}
					<div class="flex items-center gap-1 text-sm text-muted-foreground ml-2">
						<LinkIcon class="h-3 w-3" />
						<a 
							href={slide.linkUrl} 
							target="_blank" 
							rel="noopener noreferrer" 
							class="max-w-[200px] truncate hover:max-w-none hover:text-foreground transition-all"
						>
							{slide.linkUrl}
						</a>
					</div>
				{/if}
			</div>
			
			<div class="flex items-center gap-2 mr-6">
				<Button
					variant="outline"
					size="icon"
					href={`/content/${slide.contentUrl}?download=true`}
					download={slide.contentUrl.split('/').pop()}
					class="h-8 w-8"
					title="Download slide"
					onclick={(e) => e.stopPropagation()}
				>
					<DownloadIcon class="h-4 w-4" />
				</Button>

				<Button
					variant="destructive"
					size="icon"
					class="h-8 w-8"
					onclick={(e) => {
						e.stopPropagation();
						dispatch('deleteRequest');
						isPreviewDialogOpen = false;
					}}
					title="Delete slide"
				>
					<Trash2Icon class="h-4 w-4" />
				</Button>
			</div>
		</div>

		<div class="flex-1 overflow-hidden bg-black p-4">
			<div class="h-full w-full rounded-md bg-black">
				{#if slide.type === 'IMAGE'}
					<img
						src={`/content/${slide.contentUrl}`}
						alt="Slide Preview"
						class="h-full w-full object-contain"
					/>
				{:else if slide.type === 'VIDEO'}
					<video
						src={`/content/${slide.contentUrl}`}
						class="h-full w-full object-contain"
						controls={true}
					></video>
				{:else if slide.type === 'HTML'}
					<div class="h-full w-full overflow-hidden bg-white">
						<iframe
							src={`/content/${slide.contentUrl}`}
							class="h-full w-full border-0"
							title="Slide Preview"
							sandbox="allow-scripts allow-same-origin"
						></iframe>
					</div>
				{/if}
			</div>
		</div>
	</Dialog.Content>
</Dialog.Root>