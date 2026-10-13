import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import OpenAI from 'openai';

export const maxDuration = 300;

const limiter = rateLimit({ interval: 60_000, limit: 20 });

const DEFAULT_BASE_URL = process.env.TRANSLATE_BASE_URL || 'https://api.siliconflow.cn/v1';
const DEFAULT_MODEL = process.env.TRANSLATE_MODEL || 'Qwen/Qwen2.5-7B-Instruct';

/** 单批翻译的最大行数 */
const BATCH_SIZE = 20;

/** 从模型输出中提取 JSON 字符串数组（容忍代码块包裹或多余文本） */
function parseJsonArray(raw: string): string[] {
    let text = raw.trim();
    // 去掉 ```json ... ``` 代码块
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) text = fence[1].trim();
    // 截取第一个 '[' 到最后一个 ']'
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start !== -1 && end !== -1 && end > start) {
        text = text.slice(start, end + 1);
    }
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) throw new Error('翻译结果不是数组');
    return parsed.map((v) => (typeof v === 'string' ? v : String(v ?? '')));
}

async function translateBatch(
    client: OpenAI,
    model: string,
    targetLang: string,
    lines: string[],
): Promise<string[]> {
    const system =
        `你是专业的视频字幕翻译。请把用户提供的 JSON 字符串数组里的每一项翻译成${targetLang}，` +
        `保持原意、口语自然、简洁，不要合并或拆分条目。` +
        `必须返回一个与输入等长、顺序一致的 JSON 字符串数组，不要输出任何解释、编号或 Markdown。`;
    const user = JSON.stringify(lines);

    const resp = await client.chat.completions.create({
        model,
        temperature: 0.2,
        messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
        ],
    });
    const content = resp.choices?.[0]?.message?.content || '[]';
    const parsed = parseJsonArray(content);
    if (parsed.length !== lines.length) {
        throw new Error(`翻译结果数量不匹配（期望 ${lines.length}，实际 ${parsed.length}）`);
    }
    return parsed;
}

async function translateLine(
    client: OpenAI,
    model: string,
    targetLang: string,
    line: string,
): Promise<string> {
    const resp = await client.chat.completions.create({
        model,
        temperature: 0.2,
        messages: [
            {
                role: 'system',
                content: `你是专业的视频字幕翻译。把用户的内容翻译成${targetLang}，保持原意、口语自然。只返回译文，不要任何解释。`,
            },
            { role: 'user', content: line },
        ],
    });
    return (resp.choices?.[0]?.message?.content || '').trim();
}

export async function POST(req: NextRequest) {
    try {
        const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
        const { success } = limiter.check(ip);
        if (!success) {
            return NextResponse.json({ error: '请求过于频繁，请稍后一分钟再试。' }, { status: 429 });
        }

        const body = await req.json();
        const { lines, targetLang, apiKey, baseUrl, model } = body as {
            lines?: string[];
            targetLang?: string;
            apiKey?: string;
            baseUrl?: string;
            model?: string;
        };

        if (!Array.isArray(lines) || lines.length === 0) {
            return NextResponse.json({ error: '未提供要翻译的字幕内容' }, { status: 400 });
        }
        if (lines.length > 1000) {
            return NextResponse.json({ error: '单次翻译字幕条数过多（最多 1000 条）' }, { status: 400 });
        }

        const finalApiKey = apiKey || process.env.TRANSLATE_API_KEY;
        const finalBaseUrl = (baseUrl && String(baseUrl).trim()) || DEFAULT_BASE_URL;
        const finalModel = (model && String(model).trim()) || DEFAULT_MODEL;
        const finalTarget = (targetLang && String(targetLang).trim()) || '中文';

        if (!finalApiKey) {
            return NextResponse.json(
                { error: '未提供翻译 API Key（请在右上角设置中配置翻译接口）' },
                { status: 401 }
            );
        }

        const client = new OpenAI({ apiKey: finalApiKey, baseURL: finalBaseUrl });

        const translations: string[] = new Array(lines.length).fill('');

        for (let start = 0; start < lines.length; start += BATCH_SIZE) {
            const chunk = lines.slice(start, start + BATCH_SIZE);
            // 记录非空行的下标，空行原样保留，不发送给模型
            const nonEmptyIdx = chunk
                .map((t, i) => (t && t.trim() ? i : -1))
                .filter((i) => i >= 0);

            if (nonEmptyIdx.length === 0) continue;

            const payload = nonEmptyIdx.map((i) => chunk[i]);
            try {
                const translated = await translateBatch(client, finalModel, finalTarget, payload);
                nonEmptyIdx.forEach((idx, j) => {
                    translations[start + idx] = translated[j];
                });
            } catch (batchErr) {
                console.warn('批量翻译失败，回退逐行翻译：', batchErr);
                for (const idx of nonEmptyIdx) {
                    translations[start + idx] = await translateLine(client, finalModel, finalTarget, chunk[idx]);
                }
            }
        }

        return NextResponse.json({ translations });

    } catch (error: unknown) {
        console.error('Translation Error:', error);
        const message = error instanceof Error ? error.message : 'Internal Error';
        const safeMessage = message
            .replace(/https?:\/\/[^\s]+/g, '[redacted-url]')
            .replace(/sk-[a-zA-Z0-9]+/g, '[redacted-key]');
        return NextResponse.json({ error: safeMessage }, { status: 500 });
    }
}
