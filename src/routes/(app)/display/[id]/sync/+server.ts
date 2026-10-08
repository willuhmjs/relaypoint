import { json } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma/prismaConnection';

export async function GET({ params }) {
	const displayId = parseInt(params.id, 10);

	if (isNaN(displayId)) {
		return json({ error: 'Invalid Display ID' }, { status: 400 });
	}

	// 1. Fetch display and include its group
	const display = await prisma.display.findUnique({
		where: { id: displayId },
		include: {
			slides: { where: { isHidden: false }, orderBy: { order: 'asc' } },
			displayGroup: true
		}
	});

	if (!display || display.slides.length === 0) {
		return json({ error: 'Display not found or has no active slides' }, { status: 404 });
	}

	// 2. Determine the correct basis timestamp for the timeline
	const isInSyncedGroup = display.displayGroup?.useSharedTimeline === true;
	const basisTime = isInSyncedGroup ? display.displayGroup.timelineBasisTime : display.timelineBasisTime;

	// 3. Build the response — send raw timelineBasisTime so clients compute
	// their own position using NTP-corrected clocks
	const response = {
		slides: display.slides.map((slide) => ({
			id: slide.id,
			type: slide.type,
			contentUrl: `/content/${slide.contentUrl}`,
			duration: slide.duration,
			linkUrl: slide.linkUrl
		})),
		transitionType: display.transitionType,
		transitionDuration: display.transitionDuration,
		showQrCode: display.showQrCode ?? true,
		timelineBasisTime: basisTime.getTime(),
		serverTime: Date.now()
	};

	return json(response);
}