<script lang="ts">
	import { enhance, deserialize } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { ActionResult } from '@sveltejs/kit';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { toast } from 'svelte-sonner';
	import { dndzone } from 'svelte-dnd-action';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import type { Slide } from '@prisma/client';
	import SlideCard from './SlideCard.svelte';
	import PendingSlideCard from './PendingSlideCard.svelte';

	let { displayId, slides }: { displayId: number; slides: Slide[] } = $props();

	let items = $state(slides);
	let isAddingSlide = $state(false);
	let isDraggingOver = $state(false);
	let slideToDelete = $state<Slide | null>(null);

	type PendingUpload = {
		tempId: string;
		filename: string;
		progress: number;
		order: number;
		slideId?: number;
	};
	let pendingUploads = $state<PendingUpload[]>([]);

	const flipDurationMs = 300;

	const FAST_PATH_MIME = (mime: string) =>
		mime.startsWith('image/') || mime.startsWith('video/') || mime === 'text/html';

	$effect(() => {
		items = slides;
	});

	function handleDndConsider(e: CustomEvent) {
		items = e.detail.items;
	}

	function handleDndFinalize(e: CustomEvent) {
		items = e.detail.items;
		const slideOrder = items.map((item) => item.id);
		const reorderForm = document.getElementById('reorder-form') as HTMLFormElement;
		const slideOrderInput = document.getElementById('slideOrderInput') as HTMLInputElement;
		if (reorderForm && slideOrderInput) {
			slideOrderInput.value = JSON.stringify(slideOrder);
			reorderForm.requestSubmit();
		}
	}

	function handleDragOver(event: DragEvent) {
		event.preventDefault();
		isDraggingOver = true;
	}

	function handleDragLeave() {
		isDraggingOver = false;
	}

	async function uploadFastPath(files: File[]): Promise<void> {
		const prepareRes = await fetch(`/dash/displays/${displayId}/slides/prepare`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				files: files.map((f) => ({ filename: f.name, type: f.type, size: f.size }))
			})
		});
		if (!prepareRes.ok) {
			throw new Error(`Prepare failed: ${prepareRes.status}`);
		}
		const { slides: prepared } = (await prepareRes.json()) as {
			slides: { slideId: number; filename: string; uploadUrl: string; contentType: string }[];
		};

		const baseOrder = items.length;
		const placeholders: PendingUpload[] = prepared.map((p, i) => ({
			tempId: `pending-${p.slideId}`,
			filename: p.filename,
			progress: 0,
			order: baseOrder + i,
			slideId: p.slideId
		}));
		pendingUploads = [...pendingUploads, ...placeholders];

		const allSlideIds = prepared.map((p) => p.slideId);
		const completedSlideIds: number[] = [];

		try {
			for (let i = 0; i < files.length; i++) {
				const file = files[i];
				const meta = prepared[i];

				await new Promise<void>((resolve, reject) => {
					const xhr = new XMLHttpRequest();
					xhr.open('PUT', meta.uploadUrl);
					xhr.setRequestHeader('Content-Type', meta.contentType);
					xhr.upload.onprogress = (ev) => {
						if (!ev.lengthComputable) return;
						const pct = (ev.loaded / ev.total) * 100;
						pendingUploads = pendingUploads.map((p) =>
							p.slideId === meta.slideId ? { ...p, progress: pct } : p
						);
					};
					xhr.onerror = () => reject(new Error('Network error during upload'));
					xhr.onload = () => {
						if (xhr.status >= 200 && xhr.status < 300) resolve();
						else reject(new Error(`Upload failed: ${xhr.status}`));
					};
					xhr.send(file);
				});

				const finalizeRes = await fetch(
					`/dash/displays/${displayId}/slides/${meta.slideId}/finalize`,
					{ method: 'POST' }
				);
				if (!finalizeRes.ok) {
					throw new Error(`Finalize failed for ${meta.filename}: ${finalizeRes.status}`);
				}
				completedSlideIds.push(meta.slideId);
			}

			await invalidateAll();
			pendingUploads = pendingUploads.filter((p) => !allSlideIds.includes(p.slideId!));
			toast.success(`${files.length} slide(s) uploaded`);
		} catch (err) {
			console.error('[upload] failure, rolling back batch', err);
			try {
				await fetch(`/dash/displays/${displayId}/slides/rollback`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ slideIds: allSlideIds })
				});
			} catch (rollbackErr) {
				console.error('[upload] rollback failed', rollbackErr);
			}
			pendingUploads = pendingUploads.filter((p) => !allSlideIds.includes(p.slideId!));
			await invalidateAll();
			const failedFile = files[completedSlideIds.length];
			toast.error(
				`Upload failed at "${failedFile?.name ?? 'unknown'}". All ${files.length} slide(s) in this batch were rolled back.`
			);
		}
	}

	async function uploadServerPath(files: File[]): Promise<void> {
		const formData = new FormData();
		formData.append('displayId', String(displayId));
		for (const f of files) {
			formData.append('file', f);
		}
		const toastId = toast.loading(`Uploading ${files.length} server-processed file(s)...`);
		try {
			const res = await fetch(`/dash/displays/${displayId}?/addSlide`, {
				method: 'POST',
				body: formData
			});
			const result: ActionResult = deserialize(await res.text());

			if (result.type === 'success') {
				await invalidateAll();
				const warning = (result.data as { warning?: string } | undefined)?.warning;
				if (warning) toast.warning(warning, { id: toastId });
				else toast.success('Slide(s) added', { id: toastId });
			} else if (result.type === 'failure') {
				const message =
					(result.data as { message?: string } | undefined)?.message ?? 'Server-side upload failed';
				toast.error(message, { id: toastId });
			} else if (result.type === 'error') {
				toast.error(result.error?.message ?? 'Server-side upload failed', { id: toastId });
			} else {
				toast.error('Unexpected server response', { id: toastId });
			}
		} catch (err) {
			console.error('[upload] server-path failure', err);
			toast.error('Server-side upload failed', { id: toastId });
		}
	}

	async function handleFiles(rawFiles: FileList | File[]) {
		const files = Array.from(rawFiles).filter((f) => f.size > 0);
		if (files.length === 0) return;

		isAddingSlide = true;
		try {
			const fastPath = files.filter((f) => FAST_PATH_MIME(f.type));
			const serverPath = files.filter((f) => !FAST_PATH_MIME(f.type));

			if (fastPath.length > 0) await uploadFastPath(fastPath);
			if (serverPath.length > 0) await uploadServerPath(serverPath);
		} finally {
			isAddingSlide = false;
		}
	}

	function handleDrop(event: DragEvent) {
		event.preventDefault();
		isDraggingOver = false;
		if (isAddingSlide) {
			toast.error('Wait for the current upload to finish before adding more.');
			return;
		}
		const files = event.dataTransfer?.files;
		if (files && files.length > 0) {
			handleFiles(files);
		}
	}

	function handleFileInputChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		if (input.files && input.files.length > 0) {
			handleFiles(input.files);
			input.value = '';
		}
	}
</script>

<Card.Root>
	<Card.Header>
		<div class="flex items-center justify-between">
			<div>
				<Card.Title>Slides</Card.Title>
				<Card.Description>
					Drag and drop to reorder slides or right click for more options.
				</Card.Description>
			</div>
			<input
				type="file"
				class="hidden"
				id="add-slide-input"
				accept="image/*,video/*,.html,text/html,application/pdf,.pptx,.ppt,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint"
				multiple
				onchange={handleFileInputChange}
			/>
			<Button
				type="button"
				variant="outline"
				size="icon"
				onclick={() => document.getElementById('add-slide-input')?.click()}
				title="Add a new slide"
				disabled={isAddingSlide}
			>
				{#if isAddingSlide}
					<Loader2Icon class="h-4 w-4 animate-spin" />
				{:else}
					<PlusIcon class="h-4 w-4" />
				{/if}
			</Button>
		</div>
	</Card.Header>
	<Card.Content>
		{#if items.length > 0}
			<form id="reorder-form" method="POST" action="?/updateSlideOrder" use:enhance>
				<input type="hidden" name="displayId" value={displayId} />
				<input type="hidden" name="slideOrder" id="slideOrderInput" />
			</form>

			<section
				role="listbox"
				tabindex="0"
				use:dndzone={{ items: items, flipDurationMs, type: 'slide' }}
				onconsider={handleDndConsider}
				onfinalize={handleDndFinalize}
				ondragover={handleDragOver}
				ondragleave={handleDragLeave}
				ondrop={handleDrop}
				class="grid grid-cols-1 gap-4 rounded-md md:grid-cols-2 lg:grid-cols-3 {isDraggingOver
					? 'border-primary border-4 border-dashed'
					: 'border-4 border-transparent'}"
			>
				{#each items as slide (slide.id)}
					<SlideCard {slide} {displayId} on:deleteRequest={() => (slideToDelete = slide)} />
				{/each}
			</section>
		{:else}
			<div
				role="button"
				tabindex="0"
				class="flex min-h-[200px] flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center"
				ondragover={handleDragOver}
				ondragleave={handleDragLeave}
				ondrop={handleDrop}
				onkeydown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						document.getElementById('add-slide-input')?.click();
					}
				}}
			>
				<h3 class="text-lg font-semibold">No Slides Yet</h3>
				<p class="text-muted-foreground mt-1 text-sm">
					Drag and drop a file here or use the upload button to get started.
				</p>
			</div>
		{/if}

		{#if pendingUploads.length > 0}
			<div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
				{#each pendingUploads as p (p.tempId)}
					<PendingSlideCard filename={p.filename} progress={p.progress} order={p.order} />
				{/each}
			</div>
		{/if}
	</Card.Content>
	<Card.Footer>
		<div class="mt-4 flex items-center gap-2">
			<Button href="/display/{displayId}" target="_blank">Open Public Display</Button>
			<form method="POST" action="?/restartPresentation" use:enhance>
				<input type="hidden" name="displayId" value={displayId} />
				<Button type="submit" variant="outline">Restart Presentation</Button>
			</form>
			<form method="POST" action="?/forceReloadDisplay" use:enhance>
				<input type="hidden" name="displayId" value={displayId} />
				<Button type="submit" variant="outline">Force Reload</Button>
			</form>
			<form method="POST" action="?/forceSwUpdate" use:enhance>
				<input type="hidden" name="displayId" value={displayId} />
				<Button type="submit" variant="outline">Force SW Update</Button>
			</form>
		</div>
	</Card.Footer>
</Card.Root>

<AlertDialog.Root
	open={slideToDelete !== null}
	onOpenChange={(isOpen) => !isOpen && (slideToDelete = null)}
>
	<AlertDialog.Content class="sm:max-w-[425px]">
		<AlertDialog.Header>
			<AlertDialog.Title>Are you sure?</AlertDialog.Title>
			<AlertDialog.Description>
				This action will permanently delete this slide. This cannot be undone.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action
				onclick={() => {
					const formElement = document.getElementById(
						`delete-slide-form-${slideToDelete?.id}`
					) as HTMLFormElement;
					if (formElement) {
						formElement.requestSubmit();
					}
					slideToDelete = null;
				}}>Delete</AlertDialog.Action
			>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
