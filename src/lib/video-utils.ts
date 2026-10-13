import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';

/**
 * 解析 ffmpeg 可执行文件路径，按以下优先级：
 *   1. 环境变量 FFMPEG_PATH（自建服务器推荐，例如 /usr/bin/ffmpeg）
 *   2. npm 包 @ffmpeg-installer/ffmpeg 自带的二进制（可选依赖，按平台安装）
 *   3. 系统 PATH 中的 ffmpeg
 * 该过程不会抛错，缺失时回退到 'ffmpeg' 交给系统解析。
 */
function resolveFfmpegPath(): string {
    const envPath = process.env.FFMPEG_PATH;
    if (envPath && fs.existsSync(envPath)) return envPath;

    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const installed = require('@ffmpeg-installer/ffmpeg');
        if (installed?.path && fs.existsSync(installed.path)) return installed.path;
    } catch {
        // 当前平台的可选依赖未安装，忽略并回退
    }

    return 'ffmpeg';
}

let cachedFfmpegPath: string | null = null;

/** 返回（并缓存）当前生效的 ffmpeg 可执行文件路径。 */
export function getFfmpegPath(): string {
    if (!cachedFfmpegPath) cachedFfmpegPath = resolveFfmpegPath();
    return cachedFfmpegPath;
}

try {
    ffmpeg.setFfmpegPath(getFfmpegPath());
} catch (err) {
    console.warn('[ffmpeg] 设置 ffmpeg 路径失败，将尝试使用系统 ffmpeg：', err);
}

/* ── FFmpeg utilities ── */

export async function extractAudio(videoPath: string, audioPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(videoPath)) {
            return reject(new Error('Media file not found. It may have expired.'));
        }

        const dir = path.dirname(audioPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        ffmpeg(videoPath)
            .outputOptions(['-vn', '-acodec libmp3lame', '-ac 1', '-ar 16000'])
            .on('error', (err) => {
                console.error('FFmpeg Extract Error:', err);
                reject(err);
            })
            .on('end', () => resolve())
            .save(audioPath);
    });
}

export async function burnSubtitles(
    videoPath: string,
    srtPath: string,
    outputPath: string,
    options?: { targetHeight?: number; fontsDir?: string; aspectRatio?: string },
    onProgress?: (p: { percent: number }) => void
): Promise<void> {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(videoPath)) return reject(new Error('Video path missing'));
        if (!fs.existsSync(srtPath)) return reject(new Error('SRT path missing'));

        const safeSrtPath = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "'\\''");
        const filters: string[] = [];

        if (options?.targetHeight) {
            filters.push(`scale=-2:'if(lt(ih,${options.targetHeight}),${options.targetHeight},ih)':flags=lanczos`);
        } else {
            // Cap at 720p — encoding 1080p+ is too slow on serverless vCPUs
            filters.push(`scale=-2:'if(gt(ih,720),720,ih)':flags=fast_bilinear`);
        }

        // Aspect ratio padding — adds black bars to match target ratio (never crops)
        if (options?.aspectRatio) {
            const parts = options.aspectRatio.split(':').map(Number);
            if (parts.length === 2 && parts[0] > 0 && parts[1] > 0) {
                const [aw, ah] = parts;
                filters.push(
                    `pad=width='max(iw\\,ih*${aw}/${ah})':height='max(ih\\,iw*${ah}/${aw})'` +
                    `:x='(ow-iw)/2':y='(oh-ih)/2':color=black`
                );
            }
        }

        let subtitleFilter = `subtitles='${safeSrtPath}'`;
        if (options?.fontsDir) {
            const safeFontsDir = options.fontsDir.replace(/\\/g, '/').replace(/:/g, '\\:');
            subtitleFilter += `:fontsdir='${safeFontsDir}'`;
        }
        subtitleFilter += `:force_style='Fontname=Noto Sans,Fontsize=20,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=3,Outline=2,Shadow=0,MarginV=25'`;
        filters.push(subtitleFilter);

        console.log(`[burn] SRT size: ${fs.statSync(srtPath).size} bytes, filter: ${filters.join(',')}`);

        ffmpeg(videoPath)
            .videoFilters(filters)
            .outputOptions([
                '-c:v libx264',
                '-crf 28',
                '-preset ultrafast',
                '-threads 0',
                '-pix_fmt yuv420p',
                '-c:a copy',
                '-movflags +faststart',
            ])
            .on('progress', (p) => {
                const pct = typeof p.percent === 'number' && !isNaN(p.percent) ? p.percent : 0;
                onProgress?.({ percent: pct });
            })
            .on('error', (err) => {
                console.error('FFmpeg Burn Error:', err);
                reject(err);
            })
            .on('end', () => resolve())
            .save(outputPath);
    });
}

function probeDuration(videoPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(videoPath, (err, data) => {
            if (err) return reject(err);
            const d = data?.format?.duration;
            resolve(typeof d === 'number' && isFinite(d) ? d : 0);
        });
    });
}

/**
 * 将多段配音音频按各自起始时间对齐，混入视频。
 *
 * - 每个 clip 通过 `adelay` 定位到对应的字幕起始时间，再用 `amix` 叠加（允许重叠时混音）。
 * - keepOriginal 为真时，原音轨按 duckDb 降低音量后与新配音混合；否则完全替换原声。
 * - 视频流直接 `copy`（不重编码），速度很快。
 *
 * @param clipPaths   逐条配音音频文件（与 startsMs 一一对应）
 * @param startsMs    每条配音在时间轴上的起始毫秒
 * @param durationSec 目标视频时长（秒），用于把配音轨补齐到整段时长；为 0 时忽略
 */
export async function muxDubAudio(
    videoPath: string,
    clipPaths: string[],
    outputPath: string,
    options: { startsMs: number[]; keepOriginal: boolean; duckDb: number; durationSec?: number },
    onProgress?: (p: { percent: number }) => void
): Promise<void> {
    if (!fs.existsSync(videoPath)) throw new Error('Video path missing');
    if (clipPaths.length === 0) throw new Error('没有可用的配音片段');

    let duration = options.durationSec && options.durationSec > 0 ? options.durationSec : 0;
    if (!duration) {
        try { duration = await probeDuration(videoPath); } catch { duration = 0; }
    }

    const SR = 44100;
    const norm = `aresample=${SR},aformat=sample_fmts=fltp:sample_rates=${SR}:channel_layouts=stereo`;
    const filters: string[] = [];
    const voiceLabels: string[] = [];

    clipPaths.forEach((_clip, i) => {
        const ms = Math.max(0, Math.round(options.startsMs[i] || 0));
        const label = `v${i}`;
        filters.push(`[${i + 1}:a]${norm},adelay=delays=${ms}:all=1[${label}]`);
        voiceLabels.push(`[${label}]`);
    });

    filters.push(`${voiceLabels.join('')}amix=inputs=${clipPaths.length}:duration=longest:normalize=0[voice]`);

    let finalLabel = 'voice';
    if (options.keepOriginal) {
        const duck = -Math.abs(options.duckDb || 0);
        filters.push(`[0:a]${norm},volume=${duck}dB[orig]`);
        filters.push(`[orig][voice]amix=inputs=2:duration=first:normalize=0[aout]`);
        finalLabel = 'aout';
    } else {
        filters.push(`[voice]anull[aout]`);
        finalLabel = 'aout';
    }

    if (duration > 0) {
        filters.push(`[${finalLabel}]apad=whole_dur=${duration.toFixed(3)},atrim=0:${duration.toFixed(3)}[apadded]`);
        finalLabel = 'apadded';
    }

    return new Promise((resolve, reject) => {
        const cmd = ffmpeg();
        cmd.input(videoPath);
        clipPaths.forEach((clip) => cmd.input(clip));
        cmd.complexFilter(filters);
        cmd.outputOptions([
            '-map', '0:v',
            '-map', `[${finalLabel}]`,
            '-c:v copy',
            '-c:a aac',
            '-b:a 192k',
            '-movflags +faststart',
        ]);
        cmd.on('progress', (p) => {
            const pct = typeof p.percent === 'number' && !isNaN(p.percent) ? Math.min(100, Math.max(0, p.percent)) : 0;
            onProgress?.({ percent: pct });
        });
        cmd.on('error', (err) => {
            console.error('FFmpeg Dub Mux Error:', err);
            reject(err);
        });
        cmd.on('end', () => resolve());
        cmd.save(outputPath);
    });
}
