<script lang="ts">
	import SunIcon from '@lucide/svelte/icons/sun';
	import MoonIcon from '@lucide/svelte/icons/moon';

	import { toggleMode } from 'mode-watcher';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as NavigationMenu from '$lib/components/ui/navigation-menu/index.js';
	import { cn } from '$lib/utils.js';
	import { navigationMenuTriggerStyle } from '$lib/components/ui/navigation-menu/navigation-menu-trigger.svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { page } from '$app/state';

	type ListItemProps = HTMLAttributes<HTMLAnchorElement> & {
		title: string;
		href: string;
		content: string;
	};
</script>

<header>
	<div class="navigation">
		<div class="logo-area">
			<a href="/">
				<p class="logo">RelayPoint</p>
			</a>
		</div>

		{#if page.url.pathname.includes('dash')}
			<div class="nav-bar">
				{#snippet ListItem({ title, content, href, class: className, ...restProps }: ListItemProps)}
					<li>
						<NavigationMenu.Link>
							{#snippet child()}
								<a
									{href}
									class={cn(
										'hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground block space-y-1 rounded-md p-3 leading-none no-underline transition-colors outline-none select-none',
										className
									)}
									{...restProps}
								>
									<div class="text-sm leading-none font-medium">{title}</div>
									<p class="text-muted-foreground line-clamp-2 text-sm leading-snug">
										{content}
									</p>
								</a>
							{/snippet}
						</NavigationMenu.Link>
					</li>
				{/snippet}

				<NavigationMenu.Root viewport={false}>
					<NavigationMenu.List>
						<NavigationMenu.Item>
							<NavigationMenu.Trigger>Signage</NavigationMenu.Trigger>
							<NavigationMenu.Content>
								<ul class="grid w-[300px] gap-4 p-2">
									<li>
										<NavigationMenu.Link href="#">
											<div class="font-medium">Create</div>
											<div class="text-muted-foreground">Create a new display.</div>
										</NavigationMenu.Link>
										<NavigationMenu.Link href="#">
											<div class="font-medium">Browse</div>
											<div class="text-muted-foreground">Browse your displays.</div>
										</NavigationMenu.Link>
									</li>
								</ul>
							</NavigationMenu.Content>
						</NavigationMenu.Item>

						<!-- TODO: Add isAdmin check for the admin options -->
						<NavigationMenu.Item>
							<NavigationMenu.Trigger>Admin</NavigationMenu.Trigger>
							<NavigationMenu.Content>
								<ul class="grid w-[300px] gap-4 p-2">
									<li>
										<NavigationMenu.Link href="#">
											<div class="font-medium">Users</div>
											<div class="text-muted-foreground">Manage users.</div>
										</NavigationMenu.Link>
										<NavigationMenu.Link href="#">
											<div class="font-medium">Configure</div>
											<div class="text-muted-foreground">Configure your RelayPoint setup.</div>
										</NavigationMenu.Link>
									</li>
								</ul>
							</NavigationMenu.Content>
						</NavigationMenu.Item>

						<NavigationMenu.Item>
							<NavigationMenu.Link>
								{#snippet child()}
									<a href="/docs" class={navigationMenuTriggerStyle()}>Docs</a>
								{/snippet}
							</NavigationMenu.Link>
						</NavigationMenu.Item>
					</NavigationMenu.List>
				</NavigationMenu.Root>
			</div>
		{/if}
	</div>

	<div class="theme-switcher">
		<Button onclick={toggleMode} variant="outline" size="icon">
			<SunIcon
				class="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 !transition-all dark:scale-0 dark:-rotate-90"
			/>
			<MoonIcon
				class="absolute h-[1.2rem] w-[1.2rem] scale-0 rotate-90 !transition-all dark:scale-100 dark:rotate-0"
			/>
			<span class="sr-only">Toggle theme</span>
		</Button>
	</div>
</header>

<style>
	header {
		padding-top: 0.5rem;
		padding-left: 1rem;
		padding-right: 1rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.navigation {
		display: flex;
		align-items: center;
		gap: 2rem;
	}

	.logo-area a {
		display: inline-block;
	}

	.logo {
		font-family: var(--font-logo);
		font-size: 1.6rem;
		color: var(--primary);
		text-align: center;
	}

	.theme-switcher {
		align-items: center;
	}

	.nav-bar {
		align-items: flex-start;
	}
</style>
