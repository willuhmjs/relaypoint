<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import KeycloakIcon from '@lucide/svelte/icons/key-round';
	import LogInIcon from '@lucide/svelte/icons/log-in';
	import { enhance } from '$app/forms';
	import { env as publicEnv } from '$env/dynamic/public';

	const id = $props.id();
	let { data, form } = $props();

	const redirectTo = data.redirectTo ? `/${decodeURIComponent(data.redirectTo).slice(1)}` : `/dash`;

	// "sign in" | "sign up" — only relevant when the local provider is enabled.
	let mode = $state<'login' | 'signup'>('login');

	// Providers get a "Login with <Name>" button. The display name can be
	// overridden per-provider with PUBLIC_AUTH_PROVIDER_<ID>_LABEL (e.g.
	// PUBLIC_AUTH_PROVIDER_KEYCLOAK_LABEL="Company SSO") so a deployment can
	// brand its SSO without code changes; otherwise we fall back to the name.
	function providerLabel(providerId: string, name: string) {
		const override =
			publicEnv[`PUBLIC_AUTH_PROVIDER_${providerId.toUpperCase().replace(/-/g, '_')}_LABEL`];
		return `Login with ${override || name}`;
	}
</script>

<Card.Root class="mx-auto w-full max-w-sm">
	<Card.Header>
		<Card.Title class="text-2xl"
			>{data.localAuthEnabled && mode === 'signup' ? 'Create account' : 'Login'}</Card.Title
		>
		<Card.Description>
			{#if data.localAuthEnabled}
				Sign in to your account
			{:else if data.providers.length === 0}
				No sign-in method is configured yet.
			{:else}
				Login with one of our providers below
			{/if}
		</Card.Description>
	</Card.Header>
	<Card.Content>
		<div class="grid gap-4">
			{#if data.localAuthEnabled}
				{#if mode === 'login'}
					<form method="POST" action="?/localLogin" class="grid gap-4" use:enhance>
						<input type="hidden" name="redirectTo" value={redirectTo} />
						<div class="grid gap-2">
							<Label for="email-{id}">Email</Label>
							<Input
								id="email-{id}"
								name="email"
								type="email"
								placeholder="m@example.com"
								required
								autocomplete="email"
							/>
						</div>
						<div class="grid gap-2">
							<Label for="password-{id}">Password</Label>
							<Input
								id="password-{id}"
								name="password"
								type="password"
								required
								autocomplete="current-password"
							/>
						</div>
						{#if form?.error}
							<p class="text-sm font-medium text-red-600 dark:text-red-400" role="alert">
								{form.error}
							</p>
						{/if}
						<Button type="submit" class="w-full">Login</Button>
					</form>
					{#if data.localSignUpAllowed}
						<div class="text-center text-sm">
							Don't have an account?
							<button type="button" class="underline" onclick={() => (mode = 'signup')}>
								Sign up
							</button>
						</div>
					{/if}
				{:else}
					<form method="POST" action="?/localSignUp" class="grid gap-4" use:enhance>
						<div class="grid gap-2">
							<Label for="name-{id}">Name</Label>
							<Input
								id="name-{id}"
								name="name"
								type="text"
								placeholder="Ada Lovelace"
								required
								autocomplete="name"
							/>
						</div>
						<div class="grid gap-2">
							<Label for="signup-email-{id}">Email</Label>
							<Input
								id="signup-email-{id}"
								name="email"
								type="email"
								placeholder="m@example.com"
								required
								autocomplete="email"
							/>
						</div>
						<div class="grid gap-2">
							<Label for="signup-password-{id}">Password</Label>
							<Input
								id="signup-password-{id}"
								name="password"
								type="password"
								minlength={8}
								required
								autocomplete="new-password"
							/>
						</div>
						{#if form?.error}
							<p class="text-sm font-medium text-red-600 dark:text-red-400" role="alert">
								{form.error}
							</p>
						{/if}
						<Button type="submit" class="w-full">Create account</Button>
					</form>
					<div class="text-center text-sm">
						Already have an account?
						<button type="button" class="underline" onclick={() => (mode = 'login')}>
							Sign in
						</button>
					</div>
				{/if}
			{:else if data.providers.length === 0}
				<p class="text-muted-foreground text-sm">
					Set <code>AUTH_PROVIDERS</code> (or another OIDC provider) or
					<code>AUTH_LOCAL_ENABLED=true</code> in the server environment to enable sign-in.
				</p>
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
	</Card.Content>
</Card.Root>

<style>
	:global(form.w-full > button:nth-child(5)) {
		width: 100%;
	}
</style>
