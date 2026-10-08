import { error } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma/prismaConnection';

export const load = async ({ params }) => {
	const displayId = parseInt(params.id, 10);
	if (isNaN(displayId)) throw error(404, 'Display not found');

	const display = await prisma.display.findUnique({
		where: { id: displayId },
		include: {
			slides: {
				where: { isHidden: false },
				orderBy: { order: 'asc' }
			},
			displayGroup: true
		}
	});

	if (!display) throw error(404, 'Display not found');

	// Calculate presentation loop anchor time for sync
	const isInSyncedGroup = display.displayGroup?.useSharedTimeline === true;
	const basisTime = isInSyncedGroup
		? display.displayGroup.timelineBasisTime
		: display.timelineBasisTime;
	const timelineBasisTime = basisTime.getTime();

	const totalPresentationDuration = display.slides.reduce((sum, s) => sum + s.duration * 1000, 0);
	const now = Date.now();
	let presentationLoopAnchorTime = now;

	if (totalPresentationDuration > 0) {
		const timeSinceBasis = now - timelineBasisTime;
		const elapsedTimeInCurrentLoop = timeSinceBasis % totalPresentationDuration;
		presentationLoopAnchorTime = now - elapsedTimeInCurrentLoop;
	}

	return {
		display: {
			id: display.id,
			name: display.name,
			transitionType: display.transitionType,
			transitionDuration: display.transitionDuration,
			showQrCode: display.showQrCode,
			presentationLoopAnchorTime,
			slides: display.slides
		}
	};
};
