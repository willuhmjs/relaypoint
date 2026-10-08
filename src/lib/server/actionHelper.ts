import { fail, type RequestEvent } from '@sveltejs/kit';
import type { ZodObject, ZodRawShape } from 'zod';

export function actionHelper<Shape extends ZodRawShape, Z extends ZodObject<Shape>, R>(
	formSchema: Z,
	runnable: (data: Z['_output'], event: RequestEvent) => Promise<R>
) {
	return async (event: RequestEvent) => {
		const formData = await event.request.formData();

		const obj = Object.fromEntries(formData.entries());

		const parsed = formSchema.strict().safeParse(obj);

		if (!parsed.success) {
			const finalData: Record<string, unknown> = {};
			for (const key in obj) {
				if (!(obj[key] instanceof File)) {
					finalData[key] = obj[key];
				}
			}
			return fail(400, {
				data: finalData,
				success: false,
				errors: parsed.error.flatten().fieldErrors,
				message: 'Invalid Data'
			});
		}
		return await runnable(parsed.data, event);
	};
}
