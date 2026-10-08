import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async (event) => {
  const session = await event.locals.auth();
  if (session?.user) {
    return redirect(303, "/dash")
  }

  return {
    session,
  }
}