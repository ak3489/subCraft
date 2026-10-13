import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { MAX_FILE_SIZE } from '@/lib/limits';

/**
 * 供前端探测对象存储是否可用。未配置 BLOB_READ_WRITE_TOKEN 时前端会
 * 跳过 Vercel Blob，直接上传到 /api/process。
 */
export async function GET(): Promise<NextResponse> {
    return NextResponse.json({ enabled: !!process.env.BLOB_READ_WRITE_TOKEN });
}

export async function POST(request: Request): Promise<NextResponse> {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
        return NextResponse.json({ error: 'BLOB_NOT_CONFIGURED' }, { status: 501 });
    }

    const body = (await request.json()) as HandleUploadBody;

    try {
        const jsonResponse = await handleUpload({
            body,
            request,
            onBeforeGenerateToken: async () => ({
                allowedContentTypes: [
                    'video/mp4', 'video/quicktime', 'video/webm',
                    'audio/mpeg', 'audio/wav',
                ],
                maximumSizeInBytes: MAX_FILE_SIZE,
            }),
            onUploadCompleted: async () => {
                // Could log or track uploads here
            },
        });

        return NextResponse.json(jsonResponse);
    } catch (error) {
        return NextResponse.json(
            { error: (error as Error).message },
            { status: 400 },
        );
    }
}
