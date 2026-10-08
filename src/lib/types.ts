import type { Prisma, User, Team, DisplayGroupsOnTeams, DisplayGroup, Display } from '@prisma/client';

// A DisplayGroup that includes its array of Displays
export type DisplayGroupWithDisplays = DisplayGroup & {
  displays: Display[];
};

// The join-table record, which now includes the nested DisplayGroup
export type DisplayGroupsOnTeamsWithDisplays = DisplayGroupsOnTeams & {
  displayGroup: DisplayGroupWithDisplays;
};

// The final Team type, which includes the array of enriched join-table records
export type TeamWithDetails = Team & {
  displayGroups: DisplayGroupsOnTeamsWithDisplays[];
};

export type UserWithTeamDetails = User & {
    teams: TeamWithDetails[];
}