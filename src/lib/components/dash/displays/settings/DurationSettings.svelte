<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import type { Display, Slide } from '@prisma/client';
	import * as Dialog from '$lib/components/ui/dialog/index.js';

	let { display, slides, open = $bindable() } = $props<{ display: Display; slides: Slide[]; open: boolean }>();

	const getInitialDuration = () => {
		return slides && slides.length > 0 ? slides[0].duration : 10;
	};

	let allSlidesDuration = $state(getInitialDuration());

	$effect(() => {
		allSlidesDuration = getInitialDuration();
	});
</script>

<Dialog.Header>
	<Dialog.Title>Slide Duration</Dialog.Title>
	<Dialog.Description>Set the duration for all slides in this display.</Dialog.Description>
</Dialog.Header>
<form
	method="POST"
	action="?/updateAllSlideDurations"
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
		<Label for="duration">Duration (seconds)</Label>
		<Input id="duration" name="duration" type="number" min="1" bind:value={allSlidesDuration} />
	</div>
	<Dialog.Footer>
		<Button type="submit">Save</Button>
	</Dialog.Footer>
</form>