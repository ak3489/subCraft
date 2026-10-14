import type { Metadata } from "next";
import Link from "next/link";
import Logo from "@/components/Logo";
import {
    ArrowLeft,
    Sparkles,
    Mic,
    Languages,
    AudioLines,
    Download,
    ShieldCheck,
    Rocket,
    Terminal,
    ServerCog,
    Container,
    Network,
    HelpCircle,
    Check,
} from "lucide-react";

export const metadata: Metadata = {
    title: "使用与部署说明 — 字幕工坊 SubCraft",
    description:
        "字幕工坊 SubCraft 的功能说明与部署指南：本地运行、本地 Whisper 识别服务、在线接口配置，以及服务器（Node / Docker Compose / nginx）部署。",
};

const TOC = [
    { id: "features", label: "功能概览" },
    { id: "local", label: "本地运行" },
    { id: "whisper", label: "本地 Whisper 服务" },
    { id: "api", label: "在线接口配置" },
    { id: "server", label: "部署到服务器" },
    { id: "nginx", label: "反向代理（nginx）" },
    { id: "faq", label: "常见问题" },
];

const WHISPER_MODELS: { name: string; size: string; lang: string; note: string }[] = [
    { name: "tiny", size: "~75MB", lang: "多语", note: "最快，测试 / 低配机" },
    { name: "tiny.en", size: "~75MB", lang: "仅英文", note: "" },
    { name: "base", size: "~145MB", lang: "多语", note: "" },
    { name: "base.en", size: "~145MB", lang: "仅英文", note: "" },
    { name: "small", size: "~480MB", lang: "多语", note: "CPU 日常首选" },
    { name: "small.en", size: "~480MB", lang: "仅英文", note: "" },
    { name: "medium", size: "~1.5GB", lang: "多语", note: "质量 / 速度平衡" },
    { name: "medium.en", size: "~1.5GB", lang: "仅英文", note: "" },
    { name: "large-v1", size: "~3GB", lang: "多语", note: "旧版" },
    { name: "large-v2", size: "~3GB", lang: "多语", note: "" },
    { name: "large-v3 / large", size: "~3GB", lang: "多语", note: "质量最高（默认）" },
    { name: "large-v3-turbo / turbo", size: "~1.6GB", lang: "多语", note: "接近 large、快很多" },
    { name: "distil-small.en", size: "~350MB", lang: "仅英文", note: "蒸馏加速" },
    { name: "distil-medium.en", size: "~800MB", lang: "仅英文", note: "蒸馏加速" },
    { name: "distil-large-v2", size: "~1.5GB", lang: "仅英文", note: "蒸馏加速" },
    { name: "distil-large-v3", size: "~1.5GB", lang: "仅英文", note: "蒸馏，英文推荐" },
    { name: "distil-large-v3.5", size: "~1.5GB", lang: "仅英文", note: "最新蒸馏" },
];

function Code({ children }: { children: string }) {
    return (
        <pre className="cr-inset cr-mono mt-3 overflow-x-auto px-4 py-3 text-[12.5px] leading-relaxed text-[var(--fg)]">
            <code>{children}</code>
        </pre>
    );
}

function Section({
    id,
    eyebrow,
    title,
    icon: Icon,
    children,
}: {
    id: string;
    eyebrow: string;
    title: string;
    icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
    children: React.ReactNode;
}) {
    return (
        <section id={id} className="scroll-mt-20 border-t border-[var(--line)] pt-10 first:border-t-0 first:pt-0">
            <div className="flex items-center gap-3">
                <Icon className="h-4 w-4" style={{ color: "var(--signal)" }} />
                <span className="cr-eyebrow">{eyebrow}</span>
            </div>
            <h2 className="mt-3 text-xl sm:text-2xl font-semibold tracking-tight text-[var(--fg)]">{title}</h2>
            <div className="mt-5 space-y-4 text-[14.5px] leading-relaxed text-[var(--dim)]">{children}</div>
        </section>
    );
}

function Bullet({ children }: { children: React.ReactNode }) {
    return (
        <li className="flex gap-2.5">
            <Check className="mt-1 h-3.5 w-3.5 shrink-0" style={{ color: "var(--level)" }} />
            <span>{children}</span>
        </li>
    );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
    return (
        <div className="flex gap-3">
            <span
                className="cr-mono mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                style={{ background: "var(--panel-3)", color: "var(--fg)" }}
            >
                {n}
            </span>
            <span className="flex-1">{children}</span>
        </div>
    );
}

function Inline({ children }: { children: React.ReactNode }) {
    return (
        <code
            className="cr-mono rounded px-1.5 py-0.5 text-[12.5px]"
            style={{ background: "var(--panel-3)", color: "var(--signal-2)" }}
        >
            {children}
        </code>
    );
}

export default function GuidePage() {
    return (
        <div className="cr relative min-h-dvh">
            {/* background grid */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
                <div className="absolute inset-0 cr-grid-bg cr-fade-mask opacity-40" />
            </div>

            {/* Top bar */}
            <header
                className="sticky top-0 z-30 border-b border-[var(--line)] backdrop-blur-xl"
                style={{ background: "rgba(11,13,17,0.82)" }}
            >
                <div className="max-w-6xl mx-auto flex h-14 items-center justify-between px-5 sm:px-6">
                    <div className="flex items-center gap-3">
                        <div className="flex h-7 w-7 items-center justify-center">
                            <Logo />
                        </div>
                        <span className="cr-mono text-xs tracking-[0.22em]">SUBCRAFT</span>
                        <span className="cr-label hidden sm:inline">使用与部署说明</span>
                    </div>
                    <Link
                        href="/"
                        className="cr-focusable inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-[var(--dim)] transition-colors hover:text-[var(--fg)]"
                    >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        返回工作台
                    </Link>
                </div>
            </header>

            {/* Hero */}
            <div className="relative max-w-6xl mx-auto px-5 sm:px-6 pt-12 sm:pt-16 pb-4">
                <div className="flex items-center gap-3">
                    <span className="cr-eyebrow">Documentation</span>
                    <span className="h-px flex-1 bg-[var(--line)]" />
                </div>
                <h1 className="mt-5 text-3xl sm:text-4xl font-bold tracking-[-0.02em] leading-tight">
                    怎么用 · 怎么部署
                </h1>
                <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-[var(--dim)]">
                    字幕工坊（SubCraft）是一款开源、可自建部署的 AI 字幕工具：上传视频或粘贴直链，
                    自动完成转写、逐词对齐与样式套用，随时导出 SRT / VTT，或压制好字幕的 MP4。
                    本页说明功能、接口配置，以及本地与服务器两种启动方式。
                </p>
            </div>

            {/* Body */}
            <div className="relative max-w-6xl mx-auto px-5 sm:px-6 py-10 grid lg:grid-cols-[200px_1fr] gap-10 lg:gap-14">
                {/* TOC */}
                <aside className="hidden lg:block">
                    <div className="sticky top-20">
                        <div className="cr-label mb-3">目录</div>
                        <nav className="space-y-1">
                            {TOC.map((item) => (
                                <a
                                    key={item.id}
                                    href={`#${item.id}`}
                                    className="cr-focusable block rounded-md px-2 py-1.5 text-[13px] text-[var(--dim)] transition-colors hover:bg-[var(--panel-2)] hover:text-[var(--fg)]"
                                >
                                    {item.label}
                                </a>
                            ))}
                        </nav>
                    </div>
                </aside>

                {/* Content */}
                <div className="min-w-0 space-y-10">
                    {/* ── 功能概览 ── */}
                    <Section id="features" eyebrow="Features" title="功能概览" icon={Sparkles}>
                        <ul className="space-y-2.5">
                            <Bullet>
                                <b className="text-[var(--fg)]">双模式语音识别</b>：本地 Whisper（免 Key、音频不出本机）或任意兼容 OpenAI
                                的在线接口。
                            </Bullet>
                            <Bullet>
                                <b className="text-[var(--fg)]">词级时间轴</b>：精确到每个词的起止时间，字幕对齐更自然。
                            </Bullet>
                            <Bullet>
                                <b className="text-[var(--fg)]">字幕编辑</b>：导入后可逐段修改文本、重排时间。
                            </Bullet>
                            <Bullet>
                                <b className="text-[var(--fg)]">6 种字幕样式</b>：预设样式一键套用。
                            </Bullet>
                            <Bullet>
                                <b className="text-[var(--fg)]">字幕翻译</b>：兼容 OpenAI <Inline>/chat/completions</Inline>，目标语言可自定义。
                            </Bullet>
                            <Bullet>
                                <b className="text-[var(--fg)]">AI 配音</b>：把翻译后的字幕合成为目标语言语音，按时间轴对齐并混入视频（原声可自动压低）。
                            </Bullet>
                            <Bullet>
                                <b className="text-[var(--fg)]">导出</b>：SRT / VTT，或压制字幕的 MP4、AI 配音 MP4。
                            </Bullet>
                            <Bullet>
                                <b className="text-[var(--fg)]">隐私</b>：所有接口配置仅保存在你的浏览器本地（localStorage），不会上传。
                            </Bullet>
                        </ul>
                        <div className="grid sm:grid-cols-2 gap-3 pt-2">
                            <FeatureRow icon={Mic} title="Whisper 转写" desc="本地 / 在线，双模式" />
                            <FeatureRow icon={Languages} title="翻译" desc="任意 OpenAI 兼容接口" />
                            <FeatureRow icon={AudioLines} title="AI 配音" desc="TTS 混音进视频" />
                            <FeatureRow icon={Download} title="导出" desc="SRT · VTT · MP4" />
                        </div>
                    </Section>

                    {/* ── 本地运行 ── */}
                    <Section id="local" eyebrow="Local" title="本地运行（开发 / 自用）" icon={Rocket}>
                        <div>
                            <div className="cr-label mb-2">前置条件</div>
                            <ul className="space-y-2.5">
                                <Bullet>
                                    <b className="text-[var(--fg)]">Node.js 18+</b>（推荐 20）
                                </Bullet>
                                <Bullet>
                                    <b className="text-[var(--fg)]">FFmpeg</b>：系统 <Inline>PATH</Inline> 里有 <Inline>ffmpeg</Inline> 即可；
                                    npm 自带的二进制也能用。都不需要也行，程序会自动回退。
                                </Bullet>
                            </ul>
                        </div>
                        <div>
                            <div className="cr-label mb-2 mt-2">启动</div>
                            <Code>{`git clone <仓库地址>
cd ai-subtitles
npm install
npm run dev`}</Code>
                            <p className="mt-3">
                                浏览器打开 <Inline>http://localhost:3000</Inline>。首次上传前，点右上角
                                <b className="text-[var(--fg)]">「接口设置」</b>选择识别方式（本地 Whisper 或在线接口）。
                            </p>
                        </div>
                        <div className="cr-panel px-4 py-3">
                            <div className="flex items-center gap-2">
                                <ShieldCheck className="h-4 w-4" style={{ color: "var(--level)" }} />
                                <span className="text-[13px] text-[var(--fg)]">只想先试一下？</span>
                            </div>
                            <p className="mt-1.5 text-[13.5px]">
                                使用「本地 Whisper」模式无须任何 API Key，音频不会离开本机。
                            </p>
                        </div>
                    </Section>

                    {/* ── 本地 Whisper ── */}
                    <Section id="whisper" eyebrow="Local STT" title="本地 Whisper 识别服务（可选）" icon={Mic}>
                        <p>
                            由 <Inline>local-stt/</Inline> 提供，用 faster-whisper 在本机运行，对外暴露
                            兼容 OpenAI 的接口，<b className="text-[var(--fg)]">完全不需要 API Key</b>。
                        </p>
                        <div>
                            <div className="cr-label mb-2">安装并启动（需要 Python 3.9+，推荐 3.10–3.12）</div>
                            <Code>{`cd local-stt
python -m venv .venv
# Windows
.venv\\Scripts\\activate
# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8000`}</Code>
                            <p className="mt-3">
                                也可以一键脚本：Windows 双击 <Inline>run.bat</Inline>，macOS / Linux 执行 <Inline>./run.sh</Inline>。
                                看到 <Inline>Uvicorn running on http://0.0.0.0:8000</Inline> 即成功。
                            </p>
                        </div>
                        <div>
                            <div className="cr-label mb-2">在网页中接入</div>
                            <div className="space-y-2.5">
                                <Step n={1}>右上角打开「接口设置」。</Step>
                                <Step n={2}>
                                    语音识别选「本地 Whisper」，地址填 <Inline>http://localhost:8000/v1</Inline>，
                                    模型填 <Inline>large-v3</Inline>（或你用的模型），无需 Key。
                                </Step>
                                <Step n={3}>上传视频即可。</Step>
                            </div>
                        </div>
                        <div className="cr-panel overflow-hidden">
                            <div className="flex items-center gap-2 border-b border-[var(--line)] bg-[var(--panel-2)] px-4 py-3">
                                <ServerCog className="h-4 w-4" style={{ color: "var(--signal)" }} />
                                <span className="text-[13px] text-[var(--fg)]">模型从哪里下载</span>
                            </div>
                            <div className="px-4 py-4">
                                <ul className="space-y-2.5">
                                    <Bullet>
                                        权重托管在 <b className="text-[var(--fg)]">Hugging Face</b>，格式为
                                        <b className="text-[var(--fg)]">CTranslate2（CT2）</b>；与 OpenAI 原始的
                                        <Inline>openai/whisper-*</Inline>（<Inline>.pt</Inline>）<b className="text-[var(--fg)]">不通用</b>。
                                    </Bullet>
                                    <Bullet>
                                        首次使用某模型时自动从 <Inline>https://huggingface.co</Inline> 下载，缓存到
                                        <Inline>STT_MODELS_DIR</Inline>（默认 <Inline>local-stt/models</Inline>，Docker 为
                                        <Inline>/models</Inline> 卷）。
                                    </Bullet>
                                    <Bullet>
                                        下载后<b className="text-[var(--fg)]">同一模型不再联网</b>；换模型 / 改 revision / 清缓存才会重新下载。
                                    </Bullet>
                                    <Bullet>
                                        短名 <Inline>large-v3</Inline> 自动映射到 <Inline>Systran/faster-whisper-large-v3</Inline>；
                                        也可直接填任意 HF 上的 CT2 仓库名（如 <Inline>deepdml/faster-whisper-large-v3-turbo-ct2</Inline>）。
                                    </Bullet>
                                </ul>

                                <div className="cr-label mt-5 mb-2">可下载的模型版本</div>
                                <div className="cr-inset overflow-x-auto">
                                    <table className="w-full text-left text-[13px]">
                                        <thead>
                                            <tr className="cr-label border-b border-[var(--line)]">
                                                <th className="px-3 py-2 font-normal">短名</th>
                                                <th className="px-3 py-2 font-normal">体积</th>
                                                <th className="px-3 py-2 font-normal">语言</th>
                                                <th className="px-3 py-2 font-normal">说明</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {WHISPER_MODELS.map((m) => (
                                                <tr key={m.name} className="border-t border-[var(--line)]">
                                                    <td className="cr-mono whitespace-nowrap px-3 py-2" style={{ color: "var(--signal-2)" }}>
                                                        {m.name}
                                                    </td>
                                                    <td className="cr-mono whitespace-nowrap px-3 py-2 text-[var(--dim)]">{m.size}</td>
                                                    <td className="whitespace-nowrap px-3 py-2 text-[var(--dim)]">{m.lang}</td>
                                                    <td className="px-3 py-2 text-[var(--dim)]">{m.note || "—"}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <p className="mt-2 text-[12.5px] text-[var(--dim)]">
                                    带 <Inline>.en</Inline> 与 <Inline>distil-*</Inline> 的模型只针对英文优化；中文等其他语言请用多语版本。
                                </p>

                                <div className="cr-label mt-5 mb-2">国内网络提示（重要）</div>
                                <p className="text-[13.5px]">
                                    <Inline>huggingface.co</Inline> 在国内常常
                                    <b className="text-[var(--fg)]">访问不通畅（超时 / 很慢）</b>。首次下载模型前，
                                    建议先设国内镜像 <Inline>HF_ENDPOINT=https://hf-mirror.com</Inline>
                                    （<Inline>local-stt/.env</Inline> 加一行，或启动前临时设置）：
                                </p>
                                <Code>{`# Windows (PowerShell)
$env:HF_ENDPOINT="https://hf-mirror.com"; uvicorn server:app --host 0.0.0.0 --port 8000
# macOS / Linux
HF_ENDPOINT=https://hf-mirror.com uvicorn server:app --host 0.0.0.0 --port 8000`}</Code>
                                <p className="mt-3 text-[13.5px]">
                                    也可以设 <Inline>HTTP_PROXY</Inline> / <Inline>HTTPS_PROXY</Inline> 走代理；
                                    或手动下好后离线使用（镜像 / 内网都适用）：
                                </p>
                                <Code>{`HF_ENDPOINT=https://hf-mirror.com huggingface-cli download Systran/faster-whisper-large-v3 --local-dir <目录>`}</Code>
                                <p className="mt-2 text-[13.5px]">
                                    离线时注意：<b className="text-[var(--fg)]">必须下整份</b>（<Inline>config.json</Inline> /
                                    <Inline>model.bin</Inline> / <Inline>preprocessor_config.json</Inline> /
                                    <Inline>tokenizer.json</Inline> / <Inline>vocabulary.json</Inline> 缺一不可），
                                    下好后把网页「模型名称」/ <Inline>STT_MODEL</Inline> 填成该
                                    <b className="text-[var(--fg)]">目录路径</b>，或按 HF 缓存结构放进 <Inline>STT_MODELS_DIR</Inline>。
                                </p>
                                <p className="mt-3 text-[13.5px]">
                                    性能：CPU 上 <Inline>large-v3</Inline> 较慢，建议先用 <Inline>small</Inline> /
                                    <Inline>medium</Inline> / <Inline>large-v3-turbo</Inline>；有 NVIDIA 显卡时设
                                    <Inline>STT_DEVICE=cuda</Inline>、<Inline>STT_COMPUTE_TYPE=float16</Inline> 会快很多。
                                </p>
                            </div>
                        </div>
                    </Section>

                    {/* ── 在线接口 ── */}
                    <Section id="api" eyebrow="API" title="在线接口配置（可选）" icon={Terminal}>
                        <p>
                            三项能力都兼容 OpenAI 接口，可在网页「接口设置」里填写，也可写进 <Inline>.env</Inline>
                            作为服务端默认值。配置只保存在浏览器本地。
                        </p>
                        <div className="space-y-3">
                            <ApiRow
                                icon={Mic}
                                name="语音识别"
                                endpoint="POST /audio/transcriptions"
                                note="需支持 response_format=verbose_json 与词级时间戳（words）。"
                            />
                            <ApiRow
                                icon={Languages}
                                name="字幕翻译"
                                endpoint="POST /chat/completions"
                                note="任意兼容接口，如 SiliconFlow、DeepSeek。"
                            />
                            <ApiRow
                                icon={AudioLines}
                                name="AI 配音"
                                endpoint="POST /audio/speech"
                                note="用于「AI 配音 MP4」，把字幕合成为目标语言语音。"
                            />
                        </div>
                        <p className="text-[13.5px]">
                            对应环境变量：<Inline>TRANSCRIBE_*</Inline> / <Inline>TRANSLATE_*</Inline> /
                            <Inline>DUB_*</Inline>，详见根目录 <Inline>.env.example</Inline>。
                        </p>
                    </Section>

                    {/* ── 部署到服务器 ── */}
                    <Section id="server" eyebrow="Deploy" title="部署到服务器" icon={ServerCog}>
                        <p>两种方式，按规模任选。</p>

                        {/* 方式一 */}
                        <div className="cr-panel overflow-hidden">
                            <div className="flex items-center gap-2 border-b border-[var(--line)] bg-[var(--panel-2)] px-4 py-3">
                                <Terminal className="h-4 w-4" style={{ color: "var(--signal)" }} />
                                <span className="text-[13px] font-medium text-[var(--fg)]">方式一 · Node 直接部署</span>
                                <span className="cr-label ml-auto">适合小规模 / 已有进程守护</span>
                            </div>
                            <div className="px-4 py-4">
                                <Code>{`npm ci
npm run build
npm run start      # 默认监听 3000`}</Code>
                                <p className="mt-3">生产环境建议配置以下变量（<Inline>.env</Inline> 或系统环境变量）：</p>
                                <ul className="mt-3 space-y-2.5">
                                    <Bullet>
                                        <Inline>FFMPEG_PATH=/usr/bin/ffmpeg</Inline>：指定系统 ffmpeg。
                                    </Bullet>
                                    <Bullet>
                                        <Inline>TEMP_STORAGE_DIR=/data</Inline>：临时文件目录，挂到持久卷可避免重启丢文件。
                                    </Bullet>
                                    <Bullet>
                                        <Inline>NEXT_PUBLIC_SITE_URL=https://你的域名</Inline>：用于 OG 图片 / sitemap 绝对链接。
                                    </Bullet>
                                    <Bullet>
                                        <Inline>TRANSCRIBE_*</Inline> / <Inline>TRANSLATE_*</Inline> / <Inline>DUB_*</Inline>：接口默认值（可选）。
                                    </Bullet>
                                </ul>
                                <p className="mt-3 text-[13.5px]">
                                    用 <Inline>pm2</Inline> 或 <Inline>systemd</Inline> 让 <Inline>npm run start</Inline> 常驻即可。
                                </p>
                            </div>
                        </div>

                        {/* 方式二 */}
                        <div className="cr-panel overflow-hidden">
                            <div className="flex items-center gap-2 border-b border-[var(--line)] bg-[var(--panel-2)] px-4 py-3">
                                <Container className="h-4 w-4" style={{ color: "var(--signal)" }} />
                                <span className="text-[13px] font-medium text-[var(--fg)]">方式二 · Docker Compose（一键带本地 Whisper）</span>
                            </div>
                            <div className="px-4 py-4">
                                <Code>{`docker compose up -d --build`}</Code>
                                <ul className="mt-3 space-y-2.5">
                                    <Bullet>
                                        包含 <Inline>substudio</Inline>（对外 3000）与 <Inline>local-stt</Inline>（默认仅内网 8000）。
                                    </Bullet>
                                    <Bullet>
                                        数据卷 <Inline>substudio-data</Inline> 挂到 <Inline>/data</Inline>；<Inline>whisper-models</Inline> 缓存模型。
                                    </Bullet>
                                    <Bullet>
                                        需要 GPU：给 <Inline>local-stt</Inline> 配置 NVIDIA 运行时，并设 <Inline>STT_DEVICE=cuda</Inline>、
                                        <Inline>STT_COMPUTE_TYPE=float16</Inline>。
                                    </Bullet>
                                    <Bullet>
                                        若改用在线识别：去掉对 <Inline>local-stt</Inline> 的依赖，并把 <Inline>TRANSCRIBE_BASE_URL</Inline> 指向供应商。
                                    </Bullet>
                                </ul>
                                <p className="mt-3 text-[13.5px]">
                                    命令与 <Inline>docker-compose.yml</Inline> 完全一致，可按需增删环境变量。
                                </p>
                            </div>
                        </div>
                    </Section>

                    {/* ── nginx ── */}
                    <Section id="nginx" eyebrow="Reverse Proxy" title="反向代理（nginx）" icon={Network}>
                        <p>用 nginx 反代时，注意三处：</p>
                        <ul className="space-y-2.5">
                            <Bullet>
                                上传上限为 <b className="text-[var(--fg)]">500MB</b>：设 <Inline>client_max_body_size 500m;</Inline>
                            </Bullet>
                            <Bullet>
                                转写 / 压制耗时长：调大 <Inline>proxy_read_timeout 300s;</Inline> 与 <Inline>proxy_send_timeout 300s;</Inline>
                            </Bullet>
                            <Bullet>
                                进度接口是流式返回：建议对该路径关闭缓冲 <Inline>proxy_buffering off;</Inline>
                            </Bullet>
                        </ul>
                        <Code>{`server {
    listen 80;
    server_name your.domain;

    client_max_body_size 500m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        proxy_buffering off;
    }
}`}</Code>
                    </Section>

                    {/* ── FAQ ── */}
                    <Section id="faq" eyebrow="FAQ" title="常见问题" icon={HelpCircle}>
                        <Faq q="识别需要 API Key 吗？">
                            本地 Whisper 模式完全不需要；只有在线接口模式需要 Key。
                        </Faq>
                        <Faq q="FFmpeg 需要单独安装吗？">
                            不需要用 npm 装。系统 <Inline>PATH</Inline> 里有 <Inline>ffmpeg</Inline> 即可；想强制指定就设
                            <Inline>FFMPEG_PATH</Inline>。Docker 镜像内已自带。
                        </Faq>
                        <Faq q="支持哪些 Whisper 模型版本？下载到哪？">
                            faster-whisper 支持 <Inline>tiny</Inline> / <Inline>base</Inline> / <Inline>small</Inline> /
                            <Inline>medium</Inline> / <Inline>large-v1~v3</Inline> / <Inline>large-v3-turbo</Inline>
                            及 <Inline>.en</Inline>、<Inline>distil-*</Inline> 等版本；权重来自 Hugging Face（CT2 格式），
                            缓存在 <Inline>STT_MODELS_DIR</Inline>。完整列表见上方「本地 Whisper 服务 → 可下载的模型版本」。
                        </Faq>
                        <Faq q="首次识别很慢 / 卡在下载？">
                            首次会从 Hugging Face 下载模型（large-v3 约 1.5GB），属正常现象；下载后缓存不再联网。
                            国内可设 <Inline>HF_ENDPOINT=https://hf-mirror.com</Inline>。
                        </Faq>
                        <Faq q="我的接口配置会上传到服务器吗？">
                            不会。所有接口配置仅保存在浏览器本地 localStorage，随请求发送但不落库。
                        </Faq>
                        <Faq q="报错 open() got an unexpected keyword argument 'metadata_errors'？">
                            PyAV 19 的破坏性变更，<Inline>requirements.txt</Inline> 已用 <Inline>av&lt;19</Inline> 规避；
                            手动装过的话执行 <Inline>pip install &quot;av&lt;19&quot;</Inline>。
                        </Faq>
                    </Section>

                    {/* Footer */}
                    <div className="flex flex-wrap items-center gap-4 border-t border-[var(--line)] pt-8">
                        <Link
                            href="/"
                            className="cr-focusable inline-flex items-center gap-2 rounded-lg px-6 py-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#0B0D11]"
                            style={{ background: "var(--signal)", fontFamily: "var(--font-geist-mono), monospace" }}
                        >
                            <ArrowLeft className="h-4 w-4" />
                            返回工作台
                        </Link>
                        <span className="cr-label">SubCraft · 字幕工坊</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

function FeatureRow({
    icon: Icon,
    title,
    desc,
}: {
    icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
    title: string;
    desc: string;
}) {
    return (
        <div className="cr-panel flex items-center gap-3 px-4 py-3">
            <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                style={{ background: "var(--panel-3)" }}
            >
                <Icon className="h-4 w-4" style={{ color: "var(--signal)" }} />
            </span>
            <div className="min-w-0">
                <div className="text-[13.5px] font-medium text-[var(--fg)]">{title}</div>
                <div className="cr-label mt-0.5">{desc}</div>
            </div>
        </div>
    );
}

function ApiRow({
    icon: Icon,
    name,
    endpoint,
    note,
}: {
    icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
    name: string;
    endpoint: string;
    note: string;
}) {
    return (
        <div className="cr-panel flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
            <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                style={{ background: "var(--panel-3)" }}
            >
                <Icon className="h-4 w-4" style={{ color: "var(--signal-2)" }} />
            </span>
            <div className="w-28 shrink-0 text-[13.5px] font-medium text-[var(--fg)]">{name}</div>
            <code className="cr-mono shrink-0 text-[12px]" style={{ color: "var(--signal-2)" }}>
                {endpoint}
            </code>
            <span className="text-[13px] text-[var(--dim)] sm:ml-auto sm:text-right">{note}</span>
        </div>
    );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
    return (
        <div className="cr-panel px-4 py-3.5">
            <div className="flex items-start gap-2 text-[14px] font-medium text-[var(--fg)]">
                <HelpCircle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--signal)" }} />
                <span>{q}</span>
            </div>
            <div className="mt-1.5 pl-6 text-[13.5px] leading-relaxed text-[var(--dim)]">{children}</div>
        </div>
    );
}
