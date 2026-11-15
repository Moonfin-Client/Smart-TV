/* eslint-disable no-console */
// Makes the test clips the probe plays, into probe/media.
//
// Each clip is a few seconds of a test pattern and a tone in one combination of
// codec, size, frame rate, dynamic range and container that turns up in a real
// library. They are made here rather than kept in the repo, and a probe build
// packages whatever this folder holds. The bitrates are low to keep the package
// small, so a clip shows whether a format plays at all and not how the decoder
// copes with a heavy file.
//
//   node make-clips.js [--force] [--only <text>]
//
// Needs ffmpeg on the PATH, or its path in FFMPEG.
//
// ffmpeg cant make Dolby Vision, so real Dolby Vision clips are put in probe/media by
// hand under the names in DOLBY_VISION. They are packaged as they are, never encoded
// again, and probe.js reads the profile from the name. They stay on the machine that
// builds, so never commit them or send them to testers.
const {spawnSync} = require('child_process');
const fs = require('fs');
const path = require('path');

const MEDIA_DIR = path.join(__dirname, 'media');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const SECONDS = 6;

const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;

const SIZES = {'480p': [720, 480], '576p': [720, 576], '720p': [1280, 720], '1080p': [1920, 1080], '2160p': [3840, 2160]};
const VIDEO_BITRATE = {'480p': '600k', '576p': '700k', '720p': '800k', '1080p': '1500k', '2160p': '4000k'};

const HDR10 = 'colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc:master-display=G(13250,34500)B(7500,3000)R(34000,16000)WP(15635,16450)L(10000000,1):max-cll=1000,400:hdr10=1:repeat-headers=1';
const HLG = 'colorprim=bt2020:transfer=arib-std-b67:colormatrix=bt2020nc:repeat-headers=1';
const BT2020_PQ = ['-color_primaries', 'bt2020', '-color_trc', 'smpte2084', '-colorspace', 'bt2020nc'];
const BT2020_HLG = ['-color_primaries', 'bt2020', '-color_trc', 'arib-std-b67', '-colorspace', 'bt2020nc'];

// How each picture codec is asked for.
const VIDEO = {
	h264: ['-c:v', 'libx264', '-preset', 'veryfast', '-profile:v', 'high', '-pix_fmt', 'yuv420p'],
	h264hi10: ['-c:v', 'libx264', '-preset', 'veryfast', '-profile:v', 'high10', '-pix_fmt', 'yuv420p10le'],
	hevc: ['-c:v', 'libx265', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-x265-params', 'log-level=error'],
	hevc10: ['-c:v', 'libx265', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p10le', '-x265-params', 'log-level=error'],
	hevc10hdr10: ['-c:v', 'libx265', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p10le', '-x265-params', `log-level=error:${HDR10}`, ...BT2020_PQ],
	hevc10hlg: ['-c:v', 'libx265', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p10le', '-x265-params', `log-level=error:${HLG}`, ...BT2020_HLG],
	vp9: ['-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', '-row-mt', '1', '-pix_fmt', 'yuv420p'],
	vp9p2: ['-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', '-row-mt', '1', '-profile:v', '2', '-pix_fmt', 'yuv420p10le'],
	av1: ['-c:v', 'libsvtav1', '-preset', '10', '-pix_fmt', 'yuv420p', '-svtav1-params', 'lp=4'],
	av110: ['-c:v', 'libsvtav1', '-preset', '10', '-pix_fmt', 'yuv420p10le', '-svtav1-params', 'lp=4'],
	mpeg2: ['-c:v', 'mpeg2video', '-pix_fmt', 'yuv420p'],
	mpeg4: ['-c:v', 'mpeg4', '-vtag', 'xvid', '-pix_fmt', 'yuv420p']
};

// And each sound codec, with the channels it is given.
const AUDIO = {
	aac: ['-c:a', 'aac', '-ac', '2', '-b:a', '128k'],
	aac51: ['-c:a', 'aac', '-ac', '6', '-b:a', '384k'],
	aac71: ['-c:a', 'aac', '-ac', '8', '-b:a', '512k'],
	mp3: ['-c:a', 'libmp3lame', '-ac', '2', '-b:a', '160k'],
	ac3: ['-c:a', 'ac3', '-ac', '6', '-b:a', '384k'],
	eac3: ['-c:a', 'eac3', '-ac', '6', '-b:a', '384k'],
	dts: ['-c:a', 'dca', '-strict', '-2', '-ac', '6', '-b:a', '768k'],
	truehd: ['-c:a', 'truehd', '-strict', '-2', '-ac', '6'],
	flac: ['-c:a', 'flac', '-ac', '2'],
	opus: ['-c:a', 'libopus', '-ac', '2', '-b:a', '128k'],
	vorbis: ['-c:a', 'libvorbis', '-ac', '2', '-q:a', '4'],
	pcm: ['-c:a', 'pcm_s16le', '-ac', '2'],
	mp2: ['-c:a', 'mp2', '-ac', '2', '-b:a', '192k']
};

// The clips of the tests a person has to judge, named t- so the unattended run leaves
// them out.
//
// The HDR ones are the SDR reference picture carried over into BT.2020 with a PQ or
// HLG curve at an ordinary brightness, so shown correctly they look like the
// reference, and shown without regard for the curve they look washed out.
const sdrTo = (transfer) => `zscale=min=709:tin=709:pin=709:rin=tv:m=gbr:t=linear:p=2020:r=pc,format=gbrpf32le,zscale=min=gbr:tin=linear:pin=2020:rin=pc:m=2020_ncl:t=${transfer}:p=2020:r=tv:npl=203,format=yuv420p10le`;

// The speaker test gives each channel a tone of its own for two seconds, one after the
// other in the order ffmpeg lays the channels out, and a low one for the subwoofer,
// which an encoder filters anything higher out of. probe.js names the speakers in step.
const CHANNEL_SECONDS = 2;
const CHANNEL_TONES = {
	'5.1': [440, 554, 659, 50, 784, 988],
	'7.1': [440, 554, 659, 50, 784, 988, 1175, 1319]
};
const channelWalk = (tones) => tones
	.map((tone, index) => `0.4*sin(2*PI*${tone}*t)*(1-abs(sgn(floor(t/${CHANNEL_SECONDS})-${index})))`)
	.join('|');

// Picture tests carry stereo AAC or Opus, which every WebView plays, so a failure is
// the picture's. Sound tests ride on 720p H.264 for the same reason.
const video = (codec, size, fps, audio, container) => ({name: `v-${codec}-${size}${fps}-${audio}.${container}`, codec, size, fps, audio, container});
const sound = (audio, container) => ({name: `a-${audio}-in-${container}.${container}`, codec: 'h264', size: '720p', fps: 30, audio, container});
const song = (audio, container) => ({name: `m-${audio}.${container}`, audio, container});

const CLIPS = [
	video('h264', '1080p', 30, 'aac', 'mp4'),
	video('h264', '1080p', 60, 'aac', 'mp4'),
	video('h264', '2160p', 30, 'aac', 'mp4'),
	video('h264', '1080p', 30, 'aac', 'mkv'),
	video('h264', '1080p', 30, 'aac', 'mov'),
	video('h264', '1080p', 30, 'aac', 'ts'),
	video('h264hi10', '1080p', 30, 'aac', 'mkv'),
	video('hevc', '1080p', 30, 'aac', 'mp4'),
	video('hevc', '1080p', 30, 'aac', 'mkv'),
	video('hevc10', '1080p', 30, 'aac', 'mp4'),
	video('hevc10', '1080p', 60, 'aac', 'mkv'),
	video('hevc', '2160p', 30, 'aac', 'mp4'),
	video('hevc10', '2160p', 60, 'aac', 'mp4'),
	video('hevc10hdr10', '2160p', 30, 'aac', 'mp4'),
	video('hevc10hdr10', '1080p', 30, 'aac', 'mkv'),
	video('hevc10hlg', '2160p', 30, 'aac', 'mp4'),
	video('vp9', '1080p', 30, 'opus', 'webm'),
	video('vp9', '2160p', 30, 'opus', 'webm'),
	video('vp9p2', '1080p', 30, 'opus', 'webm'),
	video('vp9', '1080p', 30, 'opus', 'mkv'),
	video('av1', '1080p', 30, 'opus', 'mp4'),
	video('av1', '2160p', 30, 'opus', 'mp4'),
	video('av110', '1080p', 30, 'opus', 'mkv'),
	video('mpeg2', '576p', 25, 'mp2', 'mkv'),
	video('mpeg4', '480p', 30, 'mp3', 'mkv'),

	sound('aac51', 'mp4'),
	sound('mp3', 'mp4'),
	sound('ac3', 'mp4'),
	sound('ac3', 'mkv'),
	sound('eac3', 'mp4'),
	sound('eac3', 'mkv'),
	sound('dts', 'mkv'),
	sound('truehd', 'mkv'),
	sound('flac', 'mp4'),
	sound('flac', 'mkv'),
	sound('opus', 'mp4'),
	sound('opus', 'mkv'),
	sound('vorbis', 'mkv'),
	sound('pcm', 'mkv'),

	song('mp3', 'mp3'),
	song('flac', 'flac'),
	song('aac', 'm4a'),
	song('vorbis', 'ogg'),
	song('opus', 'opus'),
	song('pcm', 'wav'),

	{name: 't-sdr-reference.mp4', codec: 'h264', size: '1080p', fps: 30, audio: 'aac', container: 'mp4', seconds: 8},
	{name: 't-hdr10.mp4', codec: 'hevc10hdr10', size: '1080p', fps: 30, audio: 'aac', container: 'mp4', seconds: 8, filter: sdrTo('smpte2084')},
	{name: 't-hlg.mp4', codec: 'hevc10hlg', size: '1080p', fps: 30, audio: 'aac', container: 'mp4', seconds: 8, filter: sdrTo('arib-std-b67')},
	{name: 't-channels-aac51.mp4', codec: 'h264', size: '720p', fps: 30, audio: 'aac51', container: 'mp4', channels: '5.1'},
	{name: 't-channels-ac3.mp4', codec: 'h264', size: '720p', fps: 30, audio: 'ac3', container: 'mp4', channels: '5.1'},
	{name: 't-channels-eac3.mp4', codec: 'h264', size: '720p', fps: 30, audio: 'eac3', container: 'mp4', channels: '5.1'},

	// A server's transcode in the shape it sends one, HLS with H.264 and the sound in
	// MPEG-TS segments. MPEG-TS cant carry 7.1 AAC, so that one comes in fMP4 segments.
	{name: 't-hls-aac51', codec: 'h264', size: '720p', fps: 30, audio: 'aac51', container: 'hls', channels: '5.1'},
	{name: 't-hls-ac3', codec: 'h264', size: '720p', fps: 30, audio: 'ac3', container: 'hls', channels: '5.1'},
	{name: 't-hls-aac71', codec: 'h264', size: '720p', fps: 30, audio: 'aac71', container: 'hls', segments: 'fmp4', channels: '7.1'}
];

const DOLBY_VISION = ['dv-p5.mp4', 'dv-p5.mkv', 'dv-p8.mp4', 'dv-p7.mkv'];

// A stream is a folder of its playlist and segments
const outputOf = (clip) => (clip.container === 'hls' ? path.join(MEDIA_DIR, clip.name, 'index.m3u8') : path.join(MEDIA_DIR, clip.name));

const ffmpegArgs = (clip, out) => {
	const input = ['-hide_banner', '-loglevel', 'error', '-y'];
	if (clip.codec) {
		const [width, height] = SIZES[clip.size];
		input.push('-f', 'lavfi', '-i', `testsrc2=size=${width}x${height}:rate=${clip.fps}`);
	}
	const tones = CHANNEL_TONES[clip.channels];
	const sound = tones ? `aevalsrc=exprs='${channelWalk(tones)}':channel_layout=${clip.channels}:sample_rate=48000` : 'sine=frequency=440:sample_rate=48000';
	const seconds = tones ? CHANNEL_SECONDS * tones.length : clip.seconds || SECONDS;
	input.push('-f', 'lavfi', '-i', sound, '-t', String(seconds));

	const encode = [];
	if (clip.filter) encode.push('-vf', clip.filter);
	if (clip.codec) {
		// A keyframe every second, so a clip this short starts at once
		encode.push(...VIDEO[clip.codec], '-b:v', VIDEO_BITRATE[clip.size], '-g', String(clip.fps));
		// An MP4 has to name HEVC the way players look for it.
		if (/^hevc/.test(clip.codec) && (clip.container === 'mp4' || clip.container === 'mov')) encode.push('-tag:v', 'hvc1');
	}
	encode.push(...AUDIO[clip.audio]);
	if (clip.container === 'mp4' || clip.container === 'm4a' || clip.container === 'mov') encode.push('-movflags', '+faststart');
	if (clip.container === 'mp4' && (clip.audio === 'opus' || clip.audio === 'flac')) encode.push('-strict', '-2');
	if (clip.container === 'hls') {
		const fmp4 = clip.segments === 'fmp4';
		encode.push('-f', 'hls', '-hls_time', '2', '-hls_playlist_type', 'vod', ...(fmp4 ? ['-hls_segment_type', 'fmp4'] : []), '-hls_segment_filename', path.join(path.dirname(out), fmp4 ? 'seg%d.m4s' : 'seg%d.ts'));
	}
	return [...input, ...encode, out];
};

fs.mkdirSync(MEDIA_DIR, {recursive: true});
const wanted = CLIPS.filter((clip) => !only || clip.name.includes(only));
let made = 0;
let kept = 0;
const failed = [];
const sizeOf = (target) => (fs.statSync(target).isDirectory() ? fs.readdirSync(target).reduce((sum, name) => sum + sizeOf(path.join(target, name)), 0) : fs.statSync(target).size);

for (const clip of wanted) {
	const out = outputOf(clip);
	if (!force && fs.existsSync(out) && fs.statSync(out).size > 0) {
		kept += 1;
		continue;
	}
	process.stdout.write(`  ${clip.name} ... `);
	const target = path.join(MEDIA_DIR, clip.name);
	if (clip.container === 'hls') {
		fs.rmSync(target, {recursive: true, force: true});
		fs.mkdirSync(target);
	}
	// ffmpeg writes an fMP4 stream's init.mp4 where it runs, so it runs beside the playlist
	const result = spawnSync(FFMPEG, ffmpegArgs(clip, out), {encoding: 'utf8', cwd: path.dirname(out)});
	if (result.error) {
		console.log(`could not run ffmpeg: ${result.error.message}`);
		process.exit(1);
	}
	if (result.status !== 0 || !fs.existsSync(out) || fs.statSync(out).size === 0) {
		fs.rmSync(target, {recursive: true, force: true});
		failed.push(clip.name);
		console.log(`FAILED\n${(result.stderr || '').trim().split('\n').slice(-3).join('\n')}`);
		continue;
	}
	made += 1;
	console.log(`${Math.round(sizeOf(target) / 1024)} KB`);
}

const dolbyVision = DOLBY_VISION.filter((name) => fs.existsSync(path.join(MEDIA_DIR, name)));
console.log(`\n Dolby Vision clips put here by hand: ${dolbyVision.join(', ') || `none, the Dolby Vision test needs one of ${DOLBY_VISION.join(', ')}`}`);

const total = fs.readdirSync(MEDIA_DIR).reduce((sum, name) => sum + sizeOf(path.join(MEDIA_DIR, name)), 0);
console.log(`\n ${made} made, ${kept} already there, ${failed.length} failed. ${fs.readdirSync(MEDIA_DIR).length} clips, ${(total / 1048576).toFixed(1)} MB in ${MEDIA_DIR}`);
if (failed.length) {
	console.log(` Failed: ${failed.join(', ')}`);
	process.exit(1);
}
