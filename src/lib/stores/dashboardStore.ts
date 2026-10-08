import { writable, derived } from 'svelte/store';
import type { Display, DisplayGroup, Team } from '@prisma/client';

export type DisplayGroupWithRelations = DisplayGroup & {
    teams: { teamId: string }[];
    displays: (Display & {
        slides: { contentUrl: string; type: string }[];
    })[];
};

type DashboardState = {
    teams: Team[];
    displayGroups: DisplayGroupWithRelations[];
    activeTeam: Team | null;
    isDataLoaded: boolean;
};

function createDashboardStore() {
    const { subscribe, update, set } = writable<DashboardState>({
        teams: [],
        displayGroups: [],
        activeTeam: null,
        isDataLoaded: false
    });

    return {
        subscribe,
        setData: (data: { teams: Team[]; displayGroups: DisplayGroupWithRelations[] }) => {
            update((state) => {
                const newState = {
                    ...state,
                    teams: data.teams,
                    displayGroups: data.displayGroups,
                    isDataLoaded: true
                };
                if (!newState.activeTeam && data.teams.length > 0) {
                    newState.activeTeam = data.teams[0];
                }
                return newState;
            });
        },
        setActiveTeam: (team: Team) => {
            update((state) => ({ ...state, activeTeam: team }));
        }
    };
}

export const dashboardStore = createDashboardStore();
export const activeTeam = derived(dashboardStore, ($store) => $store.activeTeam);