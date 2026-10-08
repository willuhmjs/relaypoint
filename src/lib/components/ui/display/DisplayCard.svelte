<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import type { Display, Slide } from '@prisma/client';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import RotateCwIcon from '@lucide/svelte/icons/rotate-cw';
	import { invalidateAll } from '$app/navigation';

	const {
		display,
		showDelete = true
	}: { display: Display & { slides?: Slide[] }; showDelete?: boolean } = $props();
	const firstSlide = $derived(display.slides?.[0]);

	let dialogOpen = $state(false);

	function handleDelete() {
		const formElement = document.getElementById(
			`delete-display-form-${display.id}`
		) as HTMLFormElement;
		if (formElement) {
			formElement.requestSubmit();
		}
	}
</script>

<div>
	<form
		id={`delete-display-form-${display.id}`}
		method="POST"
		action="?/deleteDisplay"
		use:enhance={() => {
			dialogOpen = false;
			return async ({ result, update }) => {
				// First, update the current page to reflect the action's result.
				await update({ reset: false });

				// If the deletion was successful, invalidate all data to force
				// the layout (and sidebar) to reload.
				if (result.type === 'success') {
					await invalidateAll();
				}
			};
		}}
	>
		<input type="hidden" name="displayId" value={display.id} />
	</form>

	<form
		id={`refresh-display-form-${display.id}`}
		method="POST"
		action="?/forceRefreshDisplay"
		use:enhance
	>
		<input type="hidden" name="displayId" value={display.id} />
	</form>

	<div class="group h-ful relative">
		<a
			href={`/dash/displays/${display.id}`}
			class="block h-full transition-transform duration-200 ease-in-out hover:scale-105"
		>
			<Card.Root class="h-full">
				<Card.Header>
					<Card.Title>{display.name}</Card.Title>
					<Card.Description>{display.description || 'No Description'}</Card.Description>
				</Card.Header>
				<Card.Content>
					<div
						class="bg-muted/50 text-muted-foreground flex h-24 items-center justify-center overflow-hidden rounded-md text-sm"
					>
						{#if firstSlide?.contentUrl}
							{#if firstSlide.type === 'IMAGE'}
								<img
									src={`/content/${firstSlide.contentUrl}`}
									alt={display.name}
									class="h-full w-full object-cover"
								/>
							{:else if firstSlide.type === 'VIDEO'}
								<video
									src={`/content/${firstSlide.contentUrl}#t=0.1`}
									class="h-full w-full object-cover"
									muted
									preload="metadata"
								></video>
							{:else if firstSlide.type === 'HTML'}
								<div class="flex h-full w-full items-center justify-center">
									<div class="flex flex-col items-center justify-center">
										<svg
											xmlns="http://www.w3.org/2000/svg"
											width="40"
											height="40"
											viewBox="0 0 20 20"
											><path
												fill="currentColor"
												d="M4 16v-2H2v2H1v-5h1v2h2v-2h1v5zm3 0v-4H5.6v-1h3.7v1H8v4zm3 0v-5h1l1.4 3.4h.1L14 11h1v5h-1v-3.1h-.1l-1.1 2.5h-.6l-1.1-2.5H11V16zm9 0h-3v-5h1v4h2zM9.4 4.2L7.1 6.5l2.3 2.3l-.6 1.2l-3.5-3.5L8.8 3zm1.2 4.6l2.3-2.3l-2.3-2.3l.6-1.2l3.5 3.5l-3.5 3.5z"
											/></svg
										>
										<p class="itatlic color-secondary">No preview available.</p>
									</div>
								</div>
							{/if}
						{:else}
							No Preview
						{/if}
					</div>
				</Card.Content>
				<Card.Footer>
					<p class="text-primary/80 text-sm italic">
						Last edited {new Date(display.updatedAt).toLocaleString()}
					</p>
				</Card.Footer>
			</Card.Root>
		</a>
		{#if showDelete}
			<div
				class="absolute top-4 right-4 z-10 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100"
			>
				<Button
					type="button"
					variant="outline"
					size="icon"
					class="h-8 w-8"
					aria-label="Force Refresh Display"
					title="Force Refresh Display"
					onclick={() =>
						(
							document.getElementById(`refresh-display-form-${display.id}`) as HTMLFormElement
						)?.requestSubmit()}
				>
					<RotateCwIcon class="h-4 w-4" />
				</Button>
				<Button
					variant="destructive"
					size="icon"
					class="h-8 w-8"
					aria-label="Delete Display"
					onclick={() => (dialogOpen = true)}
				>
					<Trash2Icon class="h-4 w-4" />
				</Button>
			</div>
		{/if}
	</div>

	<AlertDialog.Root bind:open={dialogOpen}>
		<AlertDialog.Content>
			<AlertDialog.Header>
				<AlertDialog.Title>Are you sure?</AlertDialog.Title>
				<AlertDialog.Description>
					This will permanently delete the display "{display.name}" and all of its slides. This
					action cannot be undone.
				</AlertDialog.Description>
			</AlertDialog.Header>
			<AlertDialog.Footer>
				<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
				<AlertDialog.Action onclick={handleDelete}>Delete</AlertDialog.Action>
			</AlertDialog.Footer>
		</AlertDialog.Content>
	</AlertDialog.Root>
</div>