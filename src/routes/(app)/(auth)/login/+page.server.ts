import type { PageServerLoad } from './$types';
import { buildAuthProviders } from '$lib/server/authProviders';

// This `load` function runs before the page is rendered.
export const load: PageServerLoad = async ({ url }) => {
    // Get the 'redirectTo' query parameter from the URL
    const redirectTo = url.searchParams.get('redirectTo');

    const providers = (await buildAuthProviders()).map((provider) => ({
        id: provider.id,
        name: provider.name
    }));

    // Return it so it becomes available in the `data` prop on the page
    return {
        redirectTo: redirectTo ?? undefined,
        providers
    };
};