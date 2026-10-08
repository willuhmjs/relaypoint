<script lang="ts">
    import { enhance } from '$app/forms';
    import { Button } from '$lib/components/ui/button';
    import * as Dialog from '$lib/components/ui/dialog/index.js';
    import { toast } from 'svelte-sonner';
    import type { Display, DisplayAsset } from '@prisma/client';
    import Trash2Icon from '@lucide/svelte/icons/trash-2';
    import ReplaceIcon from '@lucide/svelte/icons/replace';
    import UploadCloudIcon from '@lucide/svelte/icons/upload-cloud';
    import Loader2Icon from '@lucide/svelte/icons/loader-2';
    import CheckIcon from '@lucide/svelte/icons/check';

    let { display, open = $bindable() } = $props<{ display: Display & { assets: DisplayAsset[] }; open: boolean }>();

    let isDraggingOver = $state(false);
    let isUploading = $state(false);
    let justCopiedId = $state<string | null>(null);
    let replacingAssetId = $state<string | null>(null);
    let replacedAssetId = $state<string | null>(null);

    function handleDragOver(event: DragEvent) {
        event.preventDefault();
        isDraggingOver = true;
    }

    function handleDragLeave() {
        isDraggingOver = false;
    }

    function handleDrop(event: DragEvent) {
        event.preventDefault();
        isDraggingOver = false;
        const files = event.dataTransfer?.files;
        if (files && files.length > 0) {
            const form = document.getElementById('upload-asset-form') as HTMLFormElement;
            const input = form.querySelector('input[type=file]') as HTMLInputElement;
            input.files = files;
            form.requestSubmit();
        }
    }

    function handleReplace(asset: DisplayAsset) {
        const input = document.getElementById(`replace-asset-input-${asset.id}`) as HTMLInputElement;
        input.click();
    }

    async function copyToClipboard(asset: DisplayAsset) {
        const assetUrl = new URL(`/content/${asset.s3Path}`, window.location.origin).href;
        try {
            await navigator.clipboard.writeText(assetUrl);
            justCopiedId = asset.id;
            setTimeout(() => {
                if (justCopiedId === asset.id) {
                    justCopiedId = null;
                }
            }, 2000);
        } catch (err) {
            // Fail silently
        }
    }
</script>

<Dialog.Header>
    <Dialog.Title>Manage Assets</Dialog.Title>
    <Dialog.Description>Upload and manage shared assets for this display.</Dialog.Description>
</Dialog.Header>

<div class="space-y-4 py-4">
    <div 
        role="button"
        tabindex="0"
        class="flex min-h-[150px] flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center {isDraggingOver ? 'border-primary' : ''}"
        ondragover={handleDragOver}
        ondragleave={handleDragLeave}
        ondrop={handleDrop}
        onkeydown={(e) => e.key === 'Enter' && document.getElementById('upload-asset-input')?.click()}
        onclick={() => document.getElementById('upload-asset-input')?.click()}
    >
        {#if isUploading}
            <Loader2Icon class="mb-2 h-8 w-8 animate-spin text-muted-foreground" />
            <h3 class="text-lg font-semibold">Uploading...</h3>
        {:else}
            <UploadCloudIcon class="mb-2 h-8 w-8 text-muted-foreground" />
            <h3 class="text-lg font-semibold">Drag & drop or click to upload</h3>
        {/if}
        <p class="text-muted-foreground mt-1 text-sm">Any file type is allowed.</p>
        <form 
            id="upload-asset-form"
            method="POST" 
            action="?/uploadAsset" 
            enctype="multipart/form-data"
            use:enhance={() => {
                isUploading = true;
                const toastId = toast.loading('Uploading asset...');
                return async ({ result, update }) => {
                    await update({ reset: false });
                    isUploading = false;
                    const input = document.getElementById('upload-asset-input') as HTMLInputElement;
                    if (input) {
                        input.value = '';
                    }
                    if (result.type === 'success') {
                        toast.success('Asset uploaded successfully', { id: toastId });
                    } else {
                        toast.error('Failed to upload asset', { id: toastId });
                    }
                };
            }}
        >
            <input type="hidden" name="displayId" value={display.id} />
            <input 
                id="upload-asset-input"
                name="file"
                type="file" 
                class="hidden" 
                multiple
                onchange={(e) => (e.currentTarget as HTMLInputElement).form?.requestSubmit()}
            />
        </form>
    </div>

    <div class="space-y-2 pt-4">
        <h4 class="font-semibold">Uploaded Assets</h4>
        <div class="max-h-[300px] overflow-y-auto rounded-md border">
            {#if display.assets.length === 0}
                <p class="p-4 text-center text-sm text-muted-foreground">No assets uploaded yet.</p>
            {:else}
                {#each display.assets as asset (asset.id)}
                    <div class="flex items-center justify-between gap-4 p-2 px-4 hover:bg-muted/50">
                        <button class="truncate text-sm font-medium hover:underline" onclick={() => copyToClipboard(asset)} title="Click to copy URL">
                            {justCopiedId === asset.id ? 'Copied!' : asset.filename}
                        </button>
                        <div class="flex items-center gap-2">
                            <form 
                                method="POST" 
                                action="?/uploadAsset" 
                                enctype="multipart/form-data"
                                use:enhance={({ formData }) => {
                                    const file = formData.get('replace-file') as File;
                                    if (!file || file.size === 0) return;

                                    const renamedFile = new File([file], asset.filename, { type: file.type });
                                    formData.delete('replace-file');
                                    formData.set('file', renamedFile);

                                    replacingAssetId = asset.id;
                                    const toastId = toast.loading('Replacing asset...');

                                    return async ({ result, update }) => {
                                        await update({ reset: false });
                                        replacingAssetId = null;
                                        replacedAssetId = asset.id;
                                        setTimeout(() => { replacedAssetId = null; }, 2000);
                                        const input = document.getElementById(`replace-asset-input-${asset.id}`) as HTMLInputElement;
                                        if(input) input.value = '';

                                        if (result.type === 'success') {
                                            toast.success('Asset replaced successfully', { id: toastId });
                                        } else {
                                            toast.error('Failed to replace asset', { id: toastId });
                                        }
                                    };
                                }}
                            >
                                <input type="hidden" name="displayId" value={display.id} />
                                <input 
                                    id="replace-asset-input-{asset.id}"
                                    name="replace-file"
                                    type="file" 
                                    class="hidden"
                                    onchange={(e) => e.currentTarget.form?.requestSubmit()}
                                />
                                <Button type="button" variant="outline" size="icon" title="Replace asset" onclick={() => handleReplace(asset)} disabled={replacingAssetId === asset.id}>
                                    {#if replacingAssetId === asset.id}
                                        <Loader2Icon class="h-4 w-4 animate-spin" />
                                    {:else if replacedAssetId === asset.id}
                                        <CheckIcon class="h-4 w-4" />
                                    {:else}
                                        <ReplaceIcon class="h-4 w-4" />
                                    {/if}
                                </Button>
                            </form>
                            <form method="POST" action="?/deleteAsset" use:enhance>
                                <input type="hidden" name="assetId" value={asset.id} />
                                <Button type="submit" variant="destructive" size="icon" title="Delete asset"><Trash2Icon class="h-4 w-4" /></Button>
                            </form>
                        </div>
                    </div>
                {/each}
            {/if}
        </div>
    </div>
</div>

<Dialog.Footer>
    <Button variant="outline" onclick={() => open = false}>Close</Button>
</Dialog.Footer>