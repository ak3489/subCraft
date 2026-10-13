import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { ensureLocalFile } from '@/lib/blob-utils';
import { getStorageDir } from '@/lib/paths';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const limiter = rateLimit({ interval: 60_000, limit: 30 });

export async function GET(req: NextRequest) {
    try {
        const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
        const { success } = limiter.check(ip);
        if (!success) {
            return NextResponse.json({ error: '请求过于频繁，请稍后一分钟再试。' }, { status: 429 });
        }

        const { searchParams } = new URL(req.url);
        const jobId = searchParams.get('jobId');

        if (!jobId) {
            return NextResponse.json({ error: '未提供 jobId' }, { status: 400 });
        }

        // Sanitize jobId to prevent directory traversal
        const safeJobId = jobId.replace(/[^a-zA-Z0-9-]/g, '');
        if (safeJobId !== jobId) {
            return NextResponse.json({ error: 'jobId 无效' }, { status: 400 });
        }

        const blobUrl = searchParams.get('blobUrl');
        const baseTempDir = getStorageDir();

        // Find the media file — could be .mp4, .mp3, .webm, .mov
        const extensions = ['mp4', 'webm', 'mov', 'mp3', 'wav'];
        let mediaPath = '';
        let contentType = 'video/mp4';

        for (const ext of extensions) {
            const candidate = path.join(baseTempDir, `${safeJobId}.${ext}`);
            if (fs.existsSync(candidate)) {
                mediaPath = candidate;
                if (ext === 'mp3') contentType = 'audio/mpeg';
                else if (ext === 'wav') contentType = 'audio/wav';
                else if (ext === 'webm') contentType = 'video/webm';
                else if (ext === 'mov') contentType = 'video/quicktime';
                else contentType = 'video/mp4';
                break;
            }
        }

        // If not found locally, try downloading from Blob
        if (!mediaPath && blobUrl) {
            const defaultPath = path.join(baseTempDir, `${safeJobId}.mp4`);
            const found = await ensureLocalFile(defaultPath, blobUrl);
            if (found) {
                mediaPath = defaultPath;
                contentType = 'video/mp4';
            }
        }

        if (!mediaPath) {
            return NextResponse.json({ error: '未找到媒体' }, { status: 404 });
        }

        const stat = fs.statSync(mediaPath);
        const fileSize = stat.size;

        // Handle range requests for seeking
        const range = req.headers.get('range');

        if (range) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunkSize = end - start + 1;

            const fileStream = fs.createReadStream(mediaPath, { start, end });
            const readable = new ReadableStream({
                start(controller) {
                    fileStream.on('data', (chunk: Buffer | string) => controller.enqueue(typeof chunk === 'string' ? Buffer.from(chunk) : chunk));
                    fileStream.on('end', () => controller.close());
                    fileStream.on('error', (err) => controller.error(err));
                },
            });

            return new NextResponse(readable, {
                status: 206,
                headers: {
                    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': String(chunkSize),
                    'Content-Type': contentType,
                },
            });
        }

        // Stream the full file instead of loading it all into memory
        const fileStream = fs.createReadStream(mediaPath);
        const readable = new ReadableStream({
            start(controller) {
                fileStream.on('data', (chunk: Buffer | string) => controller.enqueue(typeof chunk === 'string' ? Buffer.from(chunk) : chunk));
                fileStream.on('end', () => controller.close());
                fileStream.on('error', (err) => controller.error(err));
            },
        });

        return new NextResponse(readable, {
            headers: {
                'Content-Length': String(fileSize),
                'Content-Type': contentType,
                'Accept-Ranges': 'bytes',
            },
        });
    } catch (error: unknown) {
        console.error('Video serve error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Internal Error' },
            { status: 500 }
        );
    }
}
