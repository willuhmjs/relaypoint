import {
	S3Client,
	CreateBucketCommand,
	HeadBucketCommand,
	type S3ClientConfig
} from '@aws-sdk/client-s3';
import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

export const BUCKET_NAME = publicEnv.PUBLIC_S3_BUCKET_NAME;

// The env vars are optional at the type level (dynamic env), but a working
// deployment always sets them; S3Client resolves sensible defaults otherwise.
export const s3Client = new S3Client({
	endpoint: publicEnv.PUBLIC_S3_ENDPOINT,
	region: publicEnv.PUBLIC_S3_REGION,
	credentials: {
		accessKeyId: privateEnv.S3_ACCESS_KEY,
		secretAccessKey: privateEnv.S3_SECRET_KEY
	},
	forcePathStyle: true
} as S3ClientConfig);
