import ffmpeginstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeinstaller from '@ffprobe-installer/ffprobe';
import ffmpeg from 'fluent-ffmpeg';
import { Readable } from 'stream';

ffmpeg.setFfmpegPath(ffmpeginstaller.path);
ffmpeg.setFfprobePath(ffprobeinstaller.path);

const DEFAULT_DURATION_SECONDS = 10;

export function getVideoDurationFromBuffer(buffer: Buffer): Promise<number> {
	const stream = Readable.from(buffer);
	return getVideoDurationFromStream(stream);
}

export function getVideoDurationFromStream(stream: Readable): Promise<number> {
	return new Promise((resolve, reject) => {
		// `fluent-ffmpeg`'s typings don't include the Readable overload, but it works at runtime.
		ffmpeg.ffprobe(stream as unknown as string, (err, metadata) => {
			if (err) return reject(err);
			resolve(Math.round(metadata.format.duration ?? DEFAULT_DURATION_SECONDS));
		});
	});
}

export const DEFAULT_VIDEO_DURATION = DEFAULT_DURATION_SECONDS;
