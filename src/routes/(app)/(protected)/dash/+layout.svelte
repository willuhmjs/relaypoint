<script lang="ts">
	import '$appDir/app.css';
	import { ModeWatcher } from 'mode-watcher';
	import { setContext, onMount, type Snippet } from 'svelte';
	import type { Session } from '@auth/core/types';
	import type { User } from '@prisma/client';
	import { dashboardStore } from '$lib/stores/dashboardStore';
	import AppSidebar from '$lib/components/app-sidebar.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import MainContentWrapper from '$lib/components/main-content-wrapper.svelte';
	let { data, children } = $props<{
		data: {
			session: Session | null;
			user: User | null;
			displayGroups: any[];
			teams: any[];
		};
		children: Snippet;
	}>();

	setContext('session', data.session);
	setContext('user', data.user);

	$effect(() => {
		if (data.teams && data.displayGroups) {
			dashboardStore.setData({ teams: data.teams, displayGroups: data.displayGroups });
		}
	});

	onMount(() => {
		const date = new Date();
		let greetingStr = '';

		if (date.getHours() < 12) {
			greetingStr = 'Good morning';
		} else if (date.getHours() < 18) {
			greetingStr = 'Good afternoon';
		} else {
			greetingStr = 'Good evening';
		}
		const userGreetingHTML = document.getElementById('dashboard-welcome-container');
		if (userGreetingHTML) {
			userGreetingHTML.innerHTML = `<h1 id="welcome-user">${greetingStr}, user</h1>`;
		}
	});
</script>

<ModeWatcher />

<section id="dashboard" class="flex h-svh overflow-hidden">
	<Sidebar.Provider>
		<AppSidebar />
		<MainContentWrapper>
			{@render children()}
		</MainContentWrapper>
	</Sidebar.Provider>
</section>
