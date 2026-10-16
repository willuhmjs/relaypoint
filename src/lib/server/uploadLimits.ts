import { env as privateEnv } from '$env/dynamic/private';

/**
 * Maximum accepted upload body size. Configurable per deployment because
 * signage videos are often multi-hundred-megabyte files.
 */
export const MAX_UPLOAD_BYTES: number = (() => {
	const mb = Number(privateEnv.MAX_UPLOAD_BYTES_MB);
	return Number.isFinite(mb) && mb > 0 ? mb * 1024 * 1024 : 1024 * 1024 * 1024;
})();
