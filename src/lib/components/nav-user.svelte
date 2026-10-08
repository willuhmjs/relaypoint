<script lang="ts">
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { useSidebar } from '$lib/components/ui/sidebar/index.js';
	import BadgeCheckIcon from '@lucide/svelte/icons/badge-check';
	import BellIcon from '@lucide/svelte/icons/bell';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import CreditCardIcon from '@lucide/svelte/icons/credit-card';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import { signOut } from '@auth/sveltekit/client';
	import type { User } from '@prisma/client';

	const { user } = $props();

	const sidebar = useSidebar();
</script>

<Sidebar.Menu>
	<Sidebar.MenuItem>
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Sidebar.MenuButton
						size="lg"
						class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
						{...props}
					>
						<Avatar.Root class="size-8 rounded-lg">
							<Avatar.Image src={user?.image} alt={user.name} />
							<Avatar.Fallback class="rounded-lg"
								>{user.name.charAt(0).toUpperCase()}</Avatar.Fallback
							>
						</Avatar.Root>
						<div class="grid flex-1 text-left text-sm leading-tight">
							<span class="truncate font-medium">{user.name}</span>
							<span class="truncate text-xs">{user.email}</span>
						</div>
						<ChevronsUpDownIcon class="ml-auto size-4" />
					</Sidebar.MenuButton>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content
				class="w-(--bits-dropdown-menu-anchor-width) min-w-56 rounded-lg"
				side={sidebar.isMobile ? 'bottom' : 'right'}
				align="end"
				sideOffset={4}
			>
				<DropdownMenu.Label class="p-0 font-normal">
					<div class="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
						<Avatar.Root class="size-8 rounded-lg">
							<Avatar.Image src={user.image} alt={user.name} />
							<Avatar.Fallback class="rounded-lg"
								>{user.name.charAt(0).toUpperCase()}</Avatar.Fallback
							>
						</Avatar.Root>
						<div class="grid flex-1 text-left text-sm leading-tight">
							<span class="truncate font-medium">{user.name}</span>
							<span class="truncate text-xs">{user.email}</span>
						</div>
					</div>
				</DropdownMenu.Label>
				<DropdownMenu.Separator />
				<!-- <DropdownMenu.Group>
					<DropdownMenu.Item>
						<SparklesIcon />
						Upgrade to Pro
					</DropdownMenu.Item>
				</DropdownMenu.Group>
				<DropdownMenu.Separator /> -->
				<DropdownMenu.Group>
					<DropdownMenu.Item>
						<BadgeCheckIcon />
						Account
					</DropdownMenu.Item>
					<DropdownMenu.Item>
						<BellIcon />
						Notifications
					</DropdownMenu.Item>
				</DropdownMenu.Group>
				<DropdownMenu.Separator />
				<!-- <form action="/auth/signin/keycloak" method="POST">
					<Button type="submit" variant="ghost">
						<DropdownMenu.Item>
							<LogOutIcon />
							Log out
						</DropdownMenu.Item>
					</Button>
				</form> -->
				<form action="/logout" method="POST">
					<DropdownMenu.Item>
						<button type="submit" class="flex w-full items-center">
							<LogOutIcon class="mr-2 h-4 w-4" />
							<span>Log out</span>
						</button>
					</DropdownMenu.Item>
				</form>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</Sidebar.MenuItem>
</Sidebar.Menu>
