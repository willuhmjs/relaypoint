<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { toast } from 'svelte-sonner';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import type { Slide } from '@prisma/client';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
    import AlertTriangleIcon from '@lucide/svelte/icons/alert-triangle';

	let {
		displayId,
		slides,
		form,
		open = $bindable()
	}: {
		displayId: number;
		slides: Slide[];
		form: any;
		open: boolean;
	} = $props();

	let isUploading = $state(false);
	let needsConfirmation = $state(false);
	let selectedFileName = $state('No file selected');
    let isFileSelected = $state(false);
    let selectedFile: File | null = $state(null);

	function handleFileChange(e: Event) {
		const target = e.target as HTMLInputElement;
        const file = target.files?.[0];
		if (file) {
            selectedFile = file;
            selectedFileName = file.name;
            isFileSelected = true;
        } else {
            selectedFile = null;
            selectedFileName = 'No file selected';
            isFileSelected = false;
        }
	}

	function handleSubmit() {
        if (!selectedFile) {
            alert('Please select a file to upload.');
            return;
        }
        if (slides.length > 0) {
            needsConfirmation = true;
        } else {
            handleUploadConfirm();
        }
    }

	function handleUploadConfirm() {
        const form = document.getElementById('upload-form') as HTMLFormElement;
        const input = document.getElementById('file-upload') as HTMLInputElement;

		if (form && input && selectedFile) {
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(selectedFile);
            input.files = dataTransfer.files;
			form.requestSubmit();
		} else {
            alert('An unexpected error occurred. Please select the file again.');
            needsConfirmation = false;
        }
	}
</script>

<Dialog.Header>
	<Dialog.Title>Upload New Presentation</Dialog.Title>
	<Dialog.Description>
		Upload an image, video, PDF, HTML, or a .zip file exported from another display. This will replace all existing slides.
	</Dialog.Description>
</Dialog.Header>

<form
    id="upload-form"
    method="POST"
    action="?/uploadFile"
    enctype="multipart/form-data"
    use:enhance={() => {
        isUploading = true;
        const toastId = toast.loading('Uploading slides...');
        return async ({ result, update }) => {
            await update({ reset: false });
            isUploading = false;
            needsConfirmation = false;
            const input = document.getElementById('file-upload') as HTMLInputElement;
            if (input) input.value = '';
            selectedFile = null;
            selectedFileName = 'No file selected';
            isFileSelected = false;
            open = false;

            if (result.type === 'success') {
                toast.success('Slides uploaded successfully', { id: toastId });
            } else {
                toast.error('Failed to upload slides', { id: toastId });
            }
        };
    }}
    class="space-y-4 py-4"
>
    <input type="hidden" name="displayId" value={displayId} />

    <div style={needsConfirmation ? 'display: none;' : ''}>
        <div class="space-y-2 px-6">
            <Label>Select a file</Label>
            <div class="flex items-center gap-2">
                <Label
                    for="file-upload"
                    class={buttonVariants({ variant: 'outline' })}
                    style="display: inline-flex; cursor: pointer;"
                >
                    Browse...
                </Label>
                <span class="truncate text-sm text-muted-foreground">{selectedFileName}</span>
            </div>
            <Input
                id="file-upload"
                name="file"
                type="file"
                required
                accept="image/*,video/*,.pdf,.html,text/html,.zip,application/zip,.pptx,.ppt,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint"
                class="hidden"
                onchange={handleFileChange}
            />
        </div>
    </div>

    {#if needsConfirmation}
        <div class="p-6">
            <div class="flex items-start gap-4">
                <div class="flex-shrink-0">
                    <AlertTriangleIcon class="h-6 w-6 text-destructive" />
                </div>
                <div class="flex-grow">
                    <h3 class="font-semibold">Are you absolutely sure?</h3>
                    <p class="text-muted-foreground mt-2 text-sm">
                        This will permanently delete all {slides.length} current slides and replace them with the
                        new upload. This action cannot be undone.
                    </p>
                </div>
            </div>
        </div>
    {/if}

    <Dialog.Footer>
        {#if needsConfirmation}
            <Button type="button" variant="outline" onclick={() => needsConfirmation = false} disabled={isUploading}>Cancel</Button>
            <Button type="button" variant="destructive" onclick={handleUploadConfirm} disabled={isUploading}>
                {#if isUploading}
                    <Loader2Icon class="mr-2 h-4 w-4 animate-spin" />
                    Please wait
                {:else}
                    Confirm & Replace
                {/if}
            </Button>
        {:else}
            <Button type="button" onclick={handleSubmit} disabled={isUploading || !isFileSelected}>
                {#if isUploading}
                    <Loader2Icon class="mr-2 h-4 w-4 animate-spin" />
                    Uploading...
                {:else if slides.length > 0}
                    Upload & Replace
                {:else}
                    Upload
                {/if}
            </Button>
        {/if}
    </Dialog.Footer>
</form>