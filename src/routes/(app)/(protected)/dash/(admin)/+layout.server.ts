import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ parent }) => {
	const data = await parent();
	if (data.user.role !== 'ADMIN') {
		redirect(303, '/dash');
	}
	return data;
};
