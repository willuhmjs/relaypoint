import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { CreateBucketCommand, HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';

/**
 * Seeds everything the e2e suites need so they run unattended in CI:
 *
 *  - the S3 bucket the app writes uploaded slides into
 *  - an admin user with a database session (cookie injected as TEST_AUTH_COOKIE)
 *  - a display to stage uploads against (exported as TEST_DISPLAY_ID)
 *
 * If DATABASE_URL is absent this exits quietly; the tests that depend on the
 * seeded data self-skip via their own `test.skip(...)` guards.
 */

const SESSION_TOKEN = 'e2e_session_token_0000000000000000000000';

export default async function globalSetup() {
	if (!process.env.DATABASE_URL) {
		console.warn('[e2e setup] DATABASE_URL not set — dependent tests will self-skip.');
		return;
	}

	const prisma = new PrismaClient({
		adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL }))
	});
	try {
		const user = await prisma.user.upsert({
			where: { email: 'e2e@relaypoint.test' },
			update: { role: 'ADMIN' },
			create: {
				email: 'e2e@relaypoint.test',
				name: 'E2E Bot',
				role: 'ADMIN'
			}
		});

		await prisma.session.deleteMany({ where: { sessionToken: SESSION_TOKEN } });
		await prisma.session.create({
			data: {
				sessionToken: SESSION_TOKEN,
				userId: user.id,
				expires: new Date(Date.now() + 1000 * 60 * 60 * 24)
			}
		});

		const group = await prisma.displayGroup.upsert({
			where: { name: 'e2e-group' },
			update: {},
			create: { name: 'e2e-group' }
		});

		let display = await prisma.display.findFirst({
			where: { displayGroupId: group.id, name: 'e2e-display' }
		});
		if (!display) {
			display = await prisma.display.create({
				data: { displayGroupId: group.id, name: 'e2e-display' }
			});
		}

		// /sync 404s for displays with zero published slides, so seed one.
		const publishedCount = await prisma.slide.count({
			where: { displayId: display.id, isHidden: false }
		});
		if (publishedCount === 0) {
			await prisma.slide.create({
				data: {
					displayId: display.id,
					order: 1,
					type: 'IMAGE',
					contentUrl: `displays/${display.id}/slides/e2e-baseline.png`,
					duration: 5,
					isHidden: false
				}
			});
		}

		// Make sure the bucket the app uploads into exists. MinIO may still be
		// booting on a cold CI runner, so poll rather than trusting a single
		// attempt (the container has no healthcheck binary we can rely on).
		const bucket = process.env.PUBLIC_S3_BUCKET_NAME;
		if (bucket && process.env.PUBLIC_S3_ENDPOINT) {
			const s3 = new S3Client({
				endpoint: process.env.PUBLIC_S3_ENDPOINT,
				region: process.env.PUBLIC_S3_REGION || 'us-east-1',
				credentials: {
					accessKeyId: process.env.S3_ACCESS_KEY || '',
					secretAccessKey: process.env.S3_SECRET_KEY || ''
				},
				forcePathStyle: true
			});
			let ready = false;
			for (let attempt = 1; attempt <= 15 && !ready; attempt++) {
				try {
					await s3.send(new HeadBucketCommand({ Bucket: bucket }));
					ready = true;
				} catch (err) {
					const name = (err as { name?: string })?.name ?? '';
					if (name === 'NotFound' || name === 'NoSuchBucket') {
						await s3.send(new CreateBucketCommand({ Bucket: bucket }));
						ready = true;
					} else if (attempt === 15) {
						throw err;
					} else {
						await new Promise((r) => setTimeout(r, 2000));
					}
				}
			}
		}

		// Workers inherit these from the main process after globalSetup returns.
		process.env.TEST_DISPLAY_ID = String(display.id);
		process.env.TEST_AUTH_COOKIE = `authjs.session-token=${SESSION_TOKEN}`;
		console.log(`[e2e setup] seeded admin user + display ${display.id}`);
	} finally {
		await prisma.$disconnect();
	}
}
