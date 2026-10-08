<script lang="ts">
	import { Toaster } from 'svelte-sonner';

	let { children } = $props();
</script>

<Toaster />
{@render children()}
