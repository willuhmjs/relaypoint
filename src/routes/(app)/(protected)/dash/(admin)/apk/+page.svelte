<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import { Switch } from '$lib/components/ui/switch';
	import type { PageData, ActionData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	let uploading = false;
</script>

<div class="space-y-6 p-4 md:p-8">
	<div>
		<h1 class="text-3xl font-bold tracking-tight">APK Management</h1>
		<p class="text-muted-foreground">Upload and manage RelayPoint APK versions.</p>
	</div>

	{#if form?.error}
		<div class="rounded-md bg-destructive/15 p-4 text-destructive">
			{form.error}
		</div>
	{/if}

	{#if form?.success}
		<div class="rounded-md bg-green-500/15 p-4 text-green-500">
			{form.success}
		</div>
	{/if}

	<Card.Root>
		<Card.Header>
			<Card.Title>Upload New APK</Card.Title>
			<Card.Description>Upload the latest version of the RelayPoint APK.</Card.Description>
		</Card.Header>
		<Card.Content>
			<form
				method="POST"
				action="?/upload"
				enctype="multipart/form-data"
				class="space-y-4"
				use:enhance={() => {
					uploading = true;
					return async ({ update }) => {
						await update();
						uploading = false;
					};
				}}
			>
				<div class="grid w-full max-w-sm items-center gap-1.5">
					<Label for="version">Version Number</Label>
					<Input type="text" id="version" name="version" placeholder="e.g., 1.2.3" required />
				</div>
				<div class="grid w-full max-w-sm items-center gap-1.5">
					<Label for="apk">APK File</Label>
					<Input type="file" id="apk" name="apk" accept=".apk" required />
				</div>
				<Button type="submit" disabled={uploading}>
					{uploading ? 'Uploading...' : 'Upload APK'}
				</Button>
			</form>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Available Versions</Card.Title>
			<Card.Description>Manage previously uploaded APK versions.</Card.Description>
		</Card.Header>
		<Card.Content>
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Version</Table.Head>
						<Table.Head>Filename</Table.Head>
						<Table.Head>Uploaded</Table.Head>
						<Table.Head>Pinned</Table.Head>
						<Table.Head class="text-right">Actions</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#if data.versions.length === 0}
						<Table.Row>
							<Table.Cell colspan={5} class="text-center text-muted-foreground">
								No APK versions found.
							</Table.Cell>
						</Table.Row>
					{:else}
						{#each data.versions as version}
							<Table.Row>
								<Table.Cell class="font-medium">
									{version.version}
									{#if version.version === data.versions[0]?.version}
										<span class="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
											Latest
										</span>
									{/if}
								</Table.Cell>
								<Table.Cell>{version.filename}</Table.Cell>
								<Table.Cell>{new Date(version.createdAt).toLocaleDateString()}</Table.Cell>
								<Table.Cell>
									<form method="POST" action="?/togglePin" use:enhance>
										<input type="hidden" name="id" value={version.id} />
										<input type="hidden" name="pinned" value={(!version.isPinned).toString()} />
										<Switch checked={version.isPinned} type="submit" />
									</form>
								</Table.Cell>
								<Table.Cell class="text-right">
									<form
										method="POST"
										action="?/delete"
										use:enhance={() => {
											return async ({ update }) => {
												await update();
											};
										}}
									>
										<input type="hidden" name="id" value={version.id} />
										<Button type="submit" variant="destructive" size="sm">Delete</Button>
									</form>
								</Table.Cell>
							</Table.Row>
						{/each}
					{/if}
				</Table.Body>
			</Table.Root>
		</Card.Content>
	</Card.Root>
</div>
