<script lang="ts">
    import { page } from '$app/state';
	import Button from '$lib/components/ui/button/button.svelte';
</script>

<section class="error-container">
    <h1 class="error-code">{page.status}</h1>
    <h3 class="error-msg">Looks like we took a wrong turn...</h3>

    <Button size="lg" onclick={() => history.back()} class="return-btn">Back to HQ →</Button>
</section>

<style>
    .error-container {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 90vh;
        flex-direction: column;
    }

    .error-code {
        font-size: 15rem;
        color: var(--primary);
        padding: 0;
    }

    .error-msg {
        font-size: 2rem;
        filter: brightness(65%);
        color: var(--primary);
        padding-bottom: 2rem;
    }
</style>