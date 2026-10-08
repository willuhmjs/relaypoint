<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import type { ActionData } from './$types';

	type Form_T = ActionData & {
		data?: {
			name: string;
		};
		errors?: {
			name?: string[];
		};
		success?: boolean;
		message?: string;
		error?: string;
	};

	let { form }: { form: Form_T } = $props();

	let name = $state('');

	$effect(() => {
		if (form?.data?.name) {
			name = form.data.name;
		}
	});
</script>

<Card.Root class="mx-auto w-full max-w-sm">
	<Card.Header>
		<Card.Title class="text-2xl">Create Display Group</Card.Title>
		<Card.Description>Enter a name for your new Display Group.</Card.Description>
	</Card.Header>
	<Card.Content>
		<form
			method="POST"
			use:enhance={() => {
				return async ({ result, update }) => {
					if (result.type === 'redirect') {
						window.location.href = result.location;
					} else {
						await update({ reset: false });
					}
				};
			}}
			class="space-y-6"
		>
			<div class="space-y-2">
				<Label for="name">Group Name</Label>
				<Input
					id="name"
					name="name"
					value={name}
					oninput={(e) => (name = e.currentTarget.value)}
					placeholder="e.g., Office TVs"
				/>
				{#if form?.errors?.name}
					<p class="text-sm font-medium text-red-600">{form.errors.name[0]}</p>
				{/if}
			</div>

			{#if form?.success}
				<p class="text-sm font-medium text-green-600">{form.message}</p>
			{/if}
			{#if form?.error}
				<p class="text-sm font-medium text-red-600">{form.error}</p>
			{/if}

			<Button type="submit">Create Display Group</Button>
		</form>
	</Card.Content>
</Card.Root>
