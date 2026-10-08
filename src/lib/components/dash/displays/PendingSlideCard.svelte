<script lang="ts">
	import Loader2Icon from '@lucide/svelte/icons/loader-2';

	let { filename, progress, order }: { filename: string; progress: number; order: number } =
		$props();
</script>

<div
	class="bg-card relative aspect-video h-full w-full rounded-lg border p-2 opacity-70"
	aria-busy="true"
	aria-live="polite"
>
	<div class="bg-muted flex h-full w-full flex-col items-center justify-center gap-2 rounded-md">
		<Loader2Icon class="text-muted-foreground h-8 w-8 animate-spin" />
		<p class="text-muted-foreground max-w-[80%] truncate text-xs" title={filename}>
			{filename}
		</p>
		<div class="bg-background h-1.5 w-3/4 overflow-hidden rounded-full">
			<div
				class="bg-primary h-full transition-[width] duration-150"
				style="width: {Math.min(100, Math.max(0, progress))}%"
			></div>
		</div>
		<p class="text-muted-foreground text-[10px]">{Math.round(progress)}%</p>
	</div>
	<span
		class="bg-primary text-primary-foreground absolute top-2 left-2 rounded-full px-2 py-1 text-xs"
	>
		{order + 1}
	</span>
</div>
