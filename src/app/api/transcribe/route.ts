import { NextRequest, NextResponse } from 'next/server';
import { extractAudio, getFfmpegPath } from '@/lib/video-utils';
import { rateLimit } from '@/lib/rate-limit';
import { ensureLocalFile } from '@/lib/blob-utils';
import { getStorageDir } from '@/lib/paths';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import OpenAI from 'openai';

export const maxDuration = 300; // 5 mins max duration for long transcriptions if deployed

const limiter = rateLimit({ interval: 60_000, limit: 5 });

const DEFAULT_BASE_URL = process.env.TRANSCRIBE_BASE_URL || 'https://api.together.xyz/v1';
const DEFAULT_MODEL = process.env.TRANSCRIBE_MODEL || 'openai/whisper-large-v3';

/** 判断接口地址是否指向本机/内网（本地 Whisper 服务无需 API Key） */
function isLocalEndpoint(url: string): boolean {
    try {
        const host = new URL(url).hostname.toLowerCase();
        return (
            host === 'localhost' ||
            host === '127.0.0.1' ||
            host === '0.0.0.0' ||
            host === '::1' ||
            host === 'host.docker.internal'
        );
    } catch {
        return false;
    }
}

interface Word {
    word: string;
    start: number;
    end: number;
}

interface Segment {
    start: number;
    end: number;
    text?: string;
}

interface TranscriptionResult {
    text?: string;
    words?: Word[];
    segments?: Segment[];
}

/** 用自带的 ffmpeg 读取媒体时长（秒）。失败时返回 0。 */
function probeDuration(filePath: string): Promise<number> {
    return new Promise((resolve) => {
        execFile(getFfmpegPath(), ['-i', filePath], { windowsHide: true }, (_err, _stdout, stderr) => {
            const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr || '');
            if (!m) return resolve(0);
            resolve(Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]));
        });
    });
}

/** 把文本切分成词：中日韩按字切，拉丁语系按单词切。 */
function tokenize(text: string): string[] {
    const tokens: string[] = [];
    const re = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]|[A-Za-z0-9\u00c0-\u024f']+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) tokens.push(m[0]);
    return tokens;
}

/** 在给定时间区间内，按词数均匀分配词级时间戳（兜底方案）。 */
function distributeWords(text: string, start: number, end: number): Word[] {
    const tokens = tokenize(text);
    if (!tokens.length) return [];
    const span = Math.max(0, end - start) || tokens.length * 0.4;
    const per = span / tokens.length;
    return tokens.map((word, i) => ({
        word,
        start: start + i * per,
        end: start + (i + 1) * per,
    }));
}

function formatTime(seconds: number): string {
    const date = new Date(seconds * 1000);
    const hh = String(date.getUTCHours()).padStart(2, '0');
    const mm = String(date.getUTCMinutes()).padStart(2, '0');
    const ss = String(date.getUTCSeconds()).padStart(2, '0');
    const ms = String(date.getUTCMilliseconds()).padStart(3, '0');
    return `${hh}:${mm}:${ss},${ms}`;
}

/** 把词数组合并成可读的字幕块并生成 SRT。 */
function buildSrt(words: Word[]): string {
    const MAX_WORDS = 10;
    const MAX_DURATION = 4.0; // seconds
    const SENTENCE_ENDINGS = /[.!?;。！？；]$/;

    let srtContent = "";
    let index = 1;
    let chunkStart = 0;

    while (chunkStart < words.length) {
        let chunkEnd = chunkStart;
        const startTime = words[chunkStart].start;

        while (chunkEnd < words.length) {
            const wordCount = chunkEnd - chunkStart + 1;
            const duration = words[chunkEnd].end - startTime;
            const word = words[chunkEnd].word.trim();
            const atSentenceBoundary = SENTENCE_ENDINGS.test(word);

            if (wordCount > 1 && (wordCount >= MAX_WORDS || duration >= MAX_DURATION)) {
                if (atSentenceBoundary) { chunkEnd++; break; }
                break;
            }

            if (atSentenceBoundary && wordCount >= 4) {
                chunkEnd++;
                break;
            }

            chunkEnd++;
        }

        const chunk = words.slice(chunkStart, chunkEnd);
        if (chunk.length === 0) break;

        const startStr = formatTime(chunk[0].start);
        const endStr = formatTime(chunk[chunk.length - 1].end);
        const text = chunk.map((w) => w.word.trim()).join(" ");

        srtContent += `${index}\n${startStr} --> ${endStr}\n${text}\n\n`;
        index++;
        chunkStart = chunkEnd;
    }

    return srtContent;
}

export async function POST(req: NextRequest) {
    let finalBaseUrl = DEFAULT_BASE_URL;
    let localEndpoint = false;
    try {
        const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
        const { success } = limiter.check(ip);
        if (!success) {
            return NextResponse.json({ error: '请求过于频繁，请稍后一分钟再试。' }, { status: 429 });
        }

        const body = await req.json();
        const { jobId, apiKey, baseUrl, model, blobUrl, mode } = body;

        const finalApiKey = apiKey || process.env.TRANSCRIBE_API_KEY || process.env.TOGETHER_API_KEY;
        finalBaseUrl = (baseUrl && String(baseUrl).trim()) || DEFAULT_BASE_URL;
        const finalModel = (model && String(model).trim()) || DEFAULT_MODEL;

        if (!jobId || !/^[a-zA-Z0-9-]+$/.test(jobId)) {
            return NextResponse.json({ error: 'jobId 缺失或格式不正确' }, { status: 400 });
        }
        // 本地端点（如 local-stt）无需 API Key
        localEndpoint = mode === 'local' || isLocalEndpoint(finalBaseUrl);
        if (!finalApiKey && !localEndpoint) {
            return NextResponse.json(
                { error: '未提供 API Key（请在右上角设置中填写，或改用本地 Whisper）' },
                { status: 401 }
            );
        }

        const baseTempDir = getStorageDir();
        const audioPath = path.join(baseTempDir, `${jobId}.mp3`);

        // Check if the input is already an audio file (MP3 upload) or a video
        const videoPath = path.join(baseTempDir, `${jobId}.mp4`);

        // If file not on disk, try fetching from Blob
        if (!fs.existsSync(videoPath) && !fs.existsSync(audioPath)) {
            if (blobUrl) {
                if (!fs.existsSync(baseTempDir)) fs.mkdirSync(baseTempDir, { recursive: true });
                await ensureLocalFile(videoPath, blobUrl);
            }
        }

        const hasVideo = fs.existsSync(videoPath);
        const hasAudio = fs.existsSync(audioPath);

        if (!hasVideo && !hasAudio) {
            // Check for wav too
            const wavPath = path.join(baseTempDir, `${jobId}.wav`);
            if (fs.existsSync(wavPath)) {
                console.log(`Converting WAV to MP3 for ${jobId}...`);
                await extractAudio(wavPath, audioPath);
            } else {
                return NextResponse.json({ error: '未找到媒体文件' }, { status: 404 });
            }
        } else if (hasVideo && !hasAudio) {
            // Extract audio from video
            console.log(`Extracting audio for ${jobId}...`);
            await extractAudio(videoPath, audioPath);
        } else {
            // Audio already exists (MP3 upload), skip extraction
            console.log(`Audio file already exists for ${jobId}, skipping extraction`);
        }

        // 2. Transcribe via the configured provider (OpenAI-compatible /audio/transcriptions)
        console.log(`Transcribing audio for ${jobId} via ${finalBaseUrl} (model: ${finalModel})...`);
        const openai = new OpenAI({
            apiKey: finalApiKey || 'local',
            baseURL: finalBaseUrl,
        });

        // Some providers reject word timestamps / verbose_json. Try the richest
        // request first, then fall back to the plain OpenAI-compatible call.
        let result: TranscriptionResult;
        const firstStream = fs.createReadStream(audioPath);
        try {
            const response = await openai.audio.transcriptions.create({
                file: firstStream,
                model: finalModel,
                response_format: "verbose_json",
                timestamp_granularities: ["word"],
            });
            result = response as unknown as TranscriptionResult;
        } catch (primaryError) {
            console.warn("Word-level transcription failed, retrying with plain request:", primaryError);
            firstStream.destroy();
            const fallbackStream = fs.createReadStream(audioPath);
            const response = await openai.audio.transcriptions.create({
                file: fallbackStream,
                model: finalModel,
            });
            result = response as unknown as TranscriptionResult;
        }

        // 3. Build word-level timestamps with graceful fallbacks.
        let words: Word[] = Array.isArray(result.words) ? result.words : [];

        // Fallback A: use segment timestamps, distributing each segment across its words.
        if (!words.length && Array.isArray(result.segments) && result.segments.length) {
            console.log(`No word timestamps — deriving from ${result.segments.length} segments`);
            words = result.segments.flatMap((seg) =>
                distributeWords(seg.text || '', seg.start, seg.end)
            );
        }

        // Fallback B: text only — estimate timings using the real media duration.
        if (!words.length && result.text) {
            console.log('No timestamps at all — estimating from text + media duration');
            const duration = await probeDuration(audioPath);
            const estimated = duration > 0 ? duration : tokenize(result.text).length / 2.5;
            words = distributeWords(result.text, 0, estimated);
        }

        if (!words.length) {
            return NextResponse.json({ error: '转写结果为空，请检查模型名称与接口地址是否正确' }, { status: 400 });
        }

        const srtContent = buildSrt(words);

        const srtPath = path.join(baseTempDir, `${jobId}.srt`);
        fs.writeFileSync(srtPath, srtContent);

        return NextResponse.json({
            jobId,
            status: 'success',
            srtContent,
            words, // Return raw words so EditorView can provide a custom editor
        });

    } catch (error: unknown) {
        console.error("Transcription Error:", error);
        const message = error instanceof Error ? error.message : 'Internal Error';

        // 最常见的一类失败：本地 Whisper 服务没启动，网络层直接拒绝连接。
        if (
            localEndpoint &&
            /ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ECONNRESET|ETIMEDOUT|socket hang up|fetch failed|connect/i.test(message)
        ) {
            return NextResponse.json(
                {
                    error: `无法连接本地 Whisper 服务（${finalBaseUrl}）。请先启动 local-stt：Windows 运行 local-stt\\run.bat，或执行 docker compose up local-stt，待出现 “Uvicorn running” 后重试。`,
                },
                { status: 502 }
            );
        }

        // 另一类：没找到 ffmpeg，无法从视频里抽出音轨。
        if (/ENOENT|spawn .*ffmpeg|ffmpeg not found|not recognized as an internal/i.test(message)) {
            return NextResponse.json(
                {
                    error: '音频提取失败：未找到 ffmpeg。请安装 ffmpeg 并加入系统 PATH，或设置环境变量 FFMPEG_PATH 指向 ffmpeg 可执行文件后重启服务。',
                },
                { status: 500 }
            );
        }

        // Strip URLs and API keys from error messages before sending to client
        const safeMessage = message
            .replace(/https?:\/\/[^\s]+/g, '[redacted-url]')
            .replace(/sk-[a-zA-Z0-9]+/g, '[redacted-key]');
        return NextResponse.json({ error: safeMessage }, { status: 500 });
    }
}
