<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import KeycloakIcon from '@lucide/svelte/icons/key-round';
	import LogInIcon from '@lucide/svelte/icons/log-in';
	import { env } from '$env/dynamic/public';
	const id = $props.id();
	const { data } = $props();

	const redirectTo = data.redirectTo ? `/${decodeURIComponent(data.redirectTo).slice(1)}` : `/dash`;

	// Providers get a "Login with <Name>" button. The display name can be
	// overridden per-provider with PUBLIC_AUTH_PROVIDER_<ID>_LABEL (e.g.
	// PUBLIC_AUTH_PROVIDER_KEYCLOAK_LABEL="Company SSO") so a deployment can
	// brand its SSO without code changes; otherwise we fall back to the name.
	function providerLabel(providerId: string, name: string) {
		const override =
			env[`PUBLIC_AUTH_PROVIDER_${providerId.toUpperCase().replace(/-/g, '_')}_LABEL`];
		return `Login with ${override || name}`;
	}
</script>

<Card.Root class="mx-auto w-full max-w-sm">
	<Card.Header>
		<Card.Title class="text-2xl">Login</Card.Title>
		<Card.Description>Login with one of our providers below</Card.Description>
	</Card.Header>
	<Card.Content>
		<div class="grid gap-4">
			{#if env.PUBLIC_AUTH_PROVIDER_LOCAL_ENABLED === 'true'}
				<div class="grid gap-2">
					<Label for="email-{id}">Email</Label>
					<Input id="email-{id}" type="email" placeholder="m@example.com" required />
				</div>
			{/if}
			{#if env.PUBLIC_AUTH_PROVIDER_LOCAL_ENABLED === 'true'}
				<div class="grid gap-2">
					<div class="flex items-center">
						<Label for="password-{id}">Password</Label>
						<a href="##" class="ml-auto inline-block text-sm underline"> Forgot your password? </a>
					</div>
					<Input id="password-{id}" type="password" required />
				</div>
				<Button type="submit" class="w-full">Login</Button>
			{/if}
			{#each data.providers as provider (provider.id)}
				<form action="/auth/signin/{provider.id}" method="POST" class="w-full">
					<input type="hidden" name="redirectTo" value={redirectTo} />

					<Button type="submit" variant="outline" class="w-full">
						{#if provider.id === 'keycloak'}
							<KeycloakIcon />
						{:else}
							<LogInIcon />
						{/if}
						{providerLabel(provider.id, provider.name)}
					</Button>
				</form>
			{/each}
		</div>
		{#if env.PUBLIC_AUTH_PROVIDER_LOCAL_ENABLED === 'true'}
			<div class="mt-4 text-center text-sm">
				Don't have an account?
				<a href="##" class="underline"> Sign up </a>
			</div>
		{/if}
	</Card.Content>
</Card.Root>

<style>
	:global(form.w-full > button:nth-child(5)) {
		width: 100%;
	}
</style>
