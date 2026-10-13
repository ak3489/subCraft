import { NextRequest, NextResponse } from 'next/server';
import { muxDubAudio } from '@/lib/video-utils';
import { rateLimit } from '@/lib/rate-limit';
import { ensureLocalFile } from '@/lib/blob-utils';
import { getStorageDir } from '@/lib/paths';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

export const maxDuration = 300; // 5 mins max duration

const limiter = rateLimit({ interval: 60_000, limit: 3 });

interface DubSegment {
    start: number;
    end: number;
    text: string;
}

/** TTS 并发数，过高容易触发供应商限流 */
const TTS_CONCURRENCY = 3;

/** 单条字幕文本过长时截断，避免超出 TTS 接口输入上限 */
const MAX_TTS_CHARS = 1000;

export async function POST(req: NextRequest) {
    try {
        const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
        const { success } = limiter.check(ip);
        if (!success) {
            return NextResponse.json({ error: '请求过于频繁，请稍后一分钟再试。' }, { status: 429 });
        }

        const body = await req.json();
        const {
            jobId,
            segments,
            isSample,
            blobUrl,
            duration,
            keepOriginal,
            duckDb,
            tts,
        } = body as {
            jobId?: string;
            segments?: DubSegment[];
            isSample?: boolean;
            blobUrl?: string | null;
            duration?: number;
            keepOriginal?: boolean;
            duckDb?: number;
            tts?: { baseUrl?: string; apiKey?: string; model?: string; voice?: string };
        };

        if (!jobId || !/^[a-zA-Z0-9-]+$/.test(jobId)) {
            return NextResponse.json({ error: 'jobId 缺失或格式不正确' }, { status: 400 });
        }
        if (!Array.isArray(segments) || segments.length === 0) {
            return NextResponse.json({ error: '没有可供配音的字幕内容' }, { status: 400 });
        }
        if (segments.length > 500) {
            return NextResponse.json({ error: '单次配音字幕条数过多（最多 500 条）' }, { status: 400 });
        }

        const apiKey = (tts?.apiKey && String(tts.apiKey).trim()) || process.env.DUB_API_KEY || '';
        const baseUrl = (tts?.baseUrl && String(tts.baseUrl).trim()) || process.env.DUB_BASE_URL || 'https://api.siliconflow.cn/v1';
        const model = (tts?.model && String(tts.model).trim()) || process.env.DUB_MODEL || 'FunAudioLLM/CosyVoice2-0.5B';
        const voice = (tts?.voice && String(tts.voice).trim()) || process.env.DUB_VOICE || 'alex';

        if (!apiKey) {
            return NextResponse.json(
                { error: '未提供配音 API Key（请在右上角「接口设置」中配置配音接口）' },
                { status: 401 }
            );
        }

        const baseTempDir = getStorageDir();
        if (!fs.existsSync(baseTempDir)) fs.mkdirSync(baseTempDir, { recursive: true });

        const videoPath = path.join(baseTempDir, `${jobId}.mp4`);
        const outputPath = path.join(baseTempDir, `${jobId}_dubbed.mp4`);

        // --- Validate / resolve the source video before streaming ---
        if (!fs.existsSync(videoPath) && isSample) {
            const sampleSource = path.join(process.cwd(), 'public', 'sample-demo.mp4');
            if (fs.existsSync(sampleSource)) {
                fs.copyFileSync(sampleSource, videoPath);
            } else {
                const origin = req.headers.get('origin') || req.nextUrl.origin;
                const res = await fetch(`${origin}/sample-demo.mp4`);
                if (res.ok) fs.writeFileSync(videoPath, Buffer.from(await res.arrayBuffer()));
            }
        }
        if (!fs.existsSync(videoPath)) {
            const found = await ensureLocalFile(videoPath, blobUrl ?? null);
            if (!found) return NextResponse.json({ error: '找不到源视频' }, { status: 404 });
        }

        // Only segments with real text participate in dubbing.
        const valid = segments
            .map((s) => ({
                start: Number(s.start) || 0,
                end: Number(s.end) || 0,
                text: (s.text || '').trim(),
            }))
            .filter((s) => s.text.length > 0);

        if (valid.length === 0) {
            return NextResponse.json({ error: '字幕内容为空，无法配音' }, { status: 400 });
        }

        const client = new OpenAI({ apiKey, baseURL: baseUrl });
        const voiceParam = voice as Parameters<typeof client.audio.speech.create>[0]['voice'];

        const encoder = new TextEncoder();
        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter();

        const sendEvent = (data: Record<string, unknown>) =>
            writer.write(encoder.encode(JSON.stringify(data) + '\n'));

        (async () => {
            const clipPaths: string[] = [];
            const startsMs: number[] = [];
            try {
                await sendEvent({ stage: 'tts', progress: 0 });

                // Synthesize each subtitle into an audio clip, with bounded concurrency.
                const results: Array<{ path: string; startMs: number } | null> = new Array(valid.length).fill(null);
                let completed = 0;
                let cursor = 0;

                const worker = async () => {
                    while (true) {
                        const i = cursor++;
                        if (i >= valid.length) return;
                        const seg = valid[i];
                        const text = seg.text.slice(0, MAX_TTS_CHARS);
                        const clipPath = path.join(baseTempDir, `${jobId}_tts_${i}.mp3`);
                        try {
                            const speech = await client.audio.speech.create({
                                model,
                                voice: voiceParam,
                                input: text,
                                response_format: 'mp3',
                            });
                            const buf = Buffer.from(await speech.arrayBuffer());
                            fs.writeFileSync(clipPath, buf);
                            results[i] = { path: clipPath, startMs: Math.max(0, Math.round(seg.start * 1000)) };
                        } catch (e) {
                            console.warn(`[dub] TTS failed for segment ${i}:`, e instanceof Error ? e.message : e);
                            results[i] = null;
                        }
                        completed++;
                        await sendEvent({
                            stage: 'tts',
                            progress: Math.round((completed / valid.length) * 100),
                            index: completed,
                            total: valid.length,
                        });
                    }
                };

                await Promise.all(
                    Array.from({ length: Math.min(TTS_CONCURRENCY, valid.length) }, () => worker())
                );

                for (const r of results) {
                    if (r) {
                        clipPaths.push(r.path);
                        startsMs.push(r.startMs);
                    }
                }

                if (clipPaths.length === 0) {
                    await sendEvent({ stage: 'error', message: '配音合成失败，请检查配音接口配置。' });
                    await writer.close();
                    return;
                }

                await sendEvent({ stage: 'muxing', progress: 0 });
                console.log(`[dub] Muxing ${clipPaths.length}/${valid.length} clips into ${jobId} (keepOriginal=${keepOriginal !== false}, duck=${duckDb}dB)`);

                await muxDubAudio(
                    videoPath,
                    clipPaths,
                    outputPath,
                    {
                        startsMs,
                        keepOriginal: keepOriginal !== false,
                        duckDb: typeof duckDb === 'number' ? duckDb : 18,
                        durationSec: typeof duration === 'number' && duration > 0 ? duration : 0,
                    },
                    (p) => { sendEvent({ stage: 'muxing', progress: Math.round(p.percent || 0) }); }
                );

                await sendEvent({ stage: 'finalizing', progress: 100 });
                await sendEvent({ done: true });

                const fileBuffer = fs.readFileSync(outputPath);
                await writer.write(new Uint8Array(fileBuffer.buffer, fileBuffer.byteOffset, fileBuffer.byteLength));
                await writer.close();

                try { fs.unlinkSync(outputPath); } catch { /* ignore */ }
            } catch (err) {
                console.error('[dub] Error:', err);
                try {
                    await sendEvent({ stage: 'error', message: err instanceof Error ? err.message : '配音失败' });
                    await writer.close();
                } catch { /* stream may already be closed */ }
            } finally {
                for (const p of clipPaths) {
                    try { fs.unlinkSync(p); } catch { /* ignore */ }
                }
            }
        })();

        return new Response(readable, {
            headers: {
                'Content-Type': 'application/octet-stream',
                'Cache-Control': 'no-cache',
            },
        });
    } catch (error: unknown) {
        console.error('[dub] Route Error:', error);
        const message = error instanceof Error ? error.message : 'Internal Error';
        const safeMessage = message
            .replace(/https?:\/\/[^\s]+/g, '[redacted-url]')
            .replace(/sk-[a-zA-Z0-9]+/g, '[redacted-key]');
        return NextResponse.json({ error: safeMessage }, { status: 500 });
    }
}
