<script lang="ts">
	import LoginForm from "$lib/components/login-form.svelte";

	let { data } = $props();
</script>

<div class="flex h-screen w-full items-center justify-center px-4">
	<LoginForm {data}/>
</div>
