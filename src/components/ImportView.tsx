"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { MotionConfig, motion } from "framer-motion";
import {
    UploadCloud,
    Link as LinkIcon,
    ArrowRight,
    ArrowUp,
    Mic,
    Ruler,
    Download,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import SubtitleSimulator from "./SubtitleSimulator";
import { cn } from "@/lib/utils";
import { MAX_FILE_SIZE, MAX_FILE_SIZE_LABEL } from "@/lib/limits";

interface ImportViewProps {
    onNext: () => void;
    setVideoFile: (file: File | null) => void;
    setMediaUrl: (url: string) => void;
    setIsSample: (v: boolean) => void;
}

const EASE = [0.22, 1, 0.36, 1] as const;

const fadeUp = {
    hidden: { opacity: 0, y: 18 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE } },
};

const stagger = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.1, delayChildren: 0.06 } },
};

const FPS = 24;

function formatTimecode(totalSeconds: number) {
    const s = Math.max(0, totalSeconds);
    const pad = (n: number) => String(n).padStart(2, "0");
    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = Math.floor(s % 60);
    const ff = Math.floor((s - Math.floor(s)) * FPS);
    return `${pad(hh)}:${pad(mm)}:${pad(ss)}:${pad(ff)}`;
}

/** Deterministic pseudo-waveform so server and client render identically. */
function waveHeights(n: number) {
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
        const v = Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.53)) * 0.82 + 0.14;
        out.push(Math.min(1, Math.max(0.12, v)));
    }
    return out;
}

const WAVE = waveHeights(56);

const CHIPS = [
    "本地 Whisper · 免 Key",
    "词级时间轴对齐",
    "6 种字幕样式",
    "导出 SRT / VTT / MP4",
];

const SPECS: { label: string; value: string; sub: string; on: number }[] = [
    { label: "ENGINE 引擎", value: "Whisper", sub: "large-v3", on: 5 },
    { label: "MODE 模式", value: "本地 / 在线", sub: "双模式", on: 4 },
    { label: "ALIGN 对齐", value: "词级", sub: "word-level", on: 5 },
    { label: "STYLES 样式", value: "6 组", sub: "presets", on: 3 },
    { label: "EXPORT 导出", value: "SRT·VTT·MP4", sub: "burn-in", on: 5 },
];

const STEPS: { n: string; en: string; zh: string; desc: string; icon: LucideIcon }[] = [
    { n: "01", en: "INGEST", zh: "导入", desc: "上传视频文件，或粘贴媒体直链", icon: UploadCloud },
    { n: "02", en: "TRANSCRIBE", zh: "转写", desc: "本地 Whisper 或在线接口，免 Key 也能跑", icon: Mic },
    { n: "03", en: "ALIGN", zh: "对齐", desc: "精确到每个词的词级时间轴", icon: Ruler },
    { n: "04", en: "EXPORT", zh: "导出", desc: "下载 SRT / VTT，或压制字幕 MP4", icon: Download },
];

export default function ImportView({ onNext, setVideoFile, setMediaUrl, setIsSample }: ImportViewProps) {
    const [url, setUrl] = useState("");
    const [error, setError] = useState("");
    const [tc, setTc] = useState("00:00:00:00");
    const heroRef = useRef<HTMLDivElement>(null);

    // Live running timecode — skipped when the user prefers reduced motion.
    useEffect(() => {
        if (typeof window === "undefined") return;
        const media = window.matchMedia("(prefers-reduced-motion: reduce)");
        if (media.matches) return;
        const start = performance.now();
        const id = window.setInterval(() => {
            setTc(formatTimecode((performance.now() - start) / 1000));
        }, 80);
        return () => window.clearInterval(id);
    }, []);

    const scrollToIngest = () => {
        heroRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    };

    const onDrop = useCallback((acceptedFiles: File[], fileRejections: unknown[]) => {
        if (fileRejections && (fileRejections as Array<{ errors: Array<{ code: string }> }>).length > 0) {
            const rejection = (fileRejections as Array<{ errors: Array<{ code: string }> }>)[0];
            if (rejection.errors.some((e) => e.code === "file-too-large")) {
                setError(`文件过大，最大支持 ${MAX_FILE_SIZE_LABEL}。`);
                return;
            }
        }
        if (acceptedFiles.length > 0) {
            setError("");
            setVideoFile(acceptedFiles[0]);
            setMediaUrl("");
            setIsSample(false);
            onNext();
        }
    }, [setVideoFile, setMediaUrl, setIsSample, onNext]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            "video/mp4": [".mp4"],
            "video/quicktime": [".mov"],
            "video/webm": [".webm"],
            "audio/mpeg": [".mp3"],
            "audio/wav": [".wav"],
        },
        maxFiles: 1,
        maxSize: MAX_FILE_SIZE,
        multiple: false,
    });

    const handleUrlSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedUrl = url.trim();
        if (!trimmedUrl) return;

        const mediaUrlRegex = /^https?:\/\/.+\.(mp4|webm|mov|mp3|wav)(\?.*)?$/i;
        if (!mediaUrlRegex.test(trimmedUrl)) {
            setError("请输入以 MP4、MOV、WEBM、MP3 或 WAV 结尾的直链");
            return;
        }

        setError("");
        setMediaUrl(trimmedUrl);
        setVideoFile(null);
        setIsSample(false);
        onNext();
    };

    const useSample = () => {
        const sampleUrl = `${window.location.origin}/sample-demo.mp4`;
        setMediaUrl(sampleUrl);
        setVideoFile(null);
        setIsSample(true);
        onNext();
    };

    const year = new Date().getFullYear();

    return (
        <MotionConfig reducedMotion="user">
            <div className="cr relative w-full pb-0">
                {/* background grid */}
                <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
                    <div className="absolute inset-0 cr-grid-bg cr-fade-mask opacity-60" />
                </div>

                {/* ── HERO ── */}
                <section className="relative max-w-6xl mx-auto px-5 sm:px-6 pt-12 sm:pt-16 pb-8">
                    <motion.div
                        variants={stagger}
                        initial="hidden"
                        animate="visible"
                        className="grid lg:grid-cols-12 gap-10 lg:gap-14 items-start"
                    >
                        {/* Left — statement */}
                        <motion.div variants={fadeUp} className="lg:col-span-7">
                            <div className="flex items-center gap-3">
                                <span className="cr-eyebrow">SubCraft · AI Subtitle Suite</span>
                                <span className="h-px flex-1 bg-[var(--line)]" />
                                <span className="cr-label">Whisper Engine</span>
                            </div>

                            <h1 className="mt-6 text-[2.1rem] sm:text-5xl lg:text-[3.5rem] font-bold tracking-[-0.02em] leading-[1.1]">
                                让每一句话
                                <br />
                                落在<span style={{ color: "var(--signal)" }}>正确的帧</span>上。
                            </h1>

                            <p className="mt-5 text-[15px] sm:text-base text-[var(--dim)] leading-relaxed max-w-lg">
                                上传视频或粘贴直链 —— AI 自动完成转写、逐词对齐与样式套用，
                                随时导出 SRT / VTT，或压制好字幕的 MP4。
                            </p>

                            <div className="mt-7 flex flex-wrap gap-2">
                                {CHIPS.map((chip) => (
                                    <span key={chip} className="cr-chip">
                                        <span className="cr-chip-dot" />
                                        {chip}
                                    </span>
                                ))}
                            </div>
                        </motion.div>

                        {/* Right — system readout */}
                        <motion.div variants={fadeUp} className="lg:col-span-5 w-full">
                            <div className="cr-panel overflow-hidden">
                                {/* header w/ live timecode */}
                                <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--line)] bg-[var(--panel-2)]">
                                    <span className="cr-label">Studio Monitor</span>
                                    <span className="flex items-center gap-2">
                                        <i className="cr-rec-dot block w-1.5 h-1.5 rounded-full" style={{ background: "var(--rec)" }} aria-hidden />
                                        <span className="cr-mono text-xs" style={{ color: "var(--signal-2)" }}>
                                            {tc}
                                        </span>
                                    </span>
                                </div>

                                {/* spec rows */}
                                <div>
                                    {SPECS.map((spec, i) => (
                                        <div
                                            key={spec.label}
                                            className={cn(
                                                "flex items-center gap-3 px-4 py-3",
                                                i !== 0 && "border-t border-[var(--line)]",
                                            )}
                                        >
                                            <span className="cr-label flex-1">{spec.label}</span>
                                            <span className="cr-mono text-[13px] text-[var(--fg)]">{spec.value}</span>
                                            <span className="cr-meter" aria-hidden>
                                                {[0, 1, 2, 3, 4].map((k) => (
                                                    <i key={k} className={k < spec.on ? "on" : undefined} />
                                                ))}
                                            </span>
                                            <span className="cr-label hidden sm:inline w-16 text-right opacity-70">{spec.sub}</span>
                                        </div>
                                    ))}
                                </div>

                                {/* idle heartbeat */}
                                <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--line)] bg-[var(--panel-2)]">
                                    <span className="cr-label">Signal · 就绪</span>
                                    <span className="cr-eq" aria-hidden>
                                        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                                            <i key={i} style={{ animationDelay: `${i * 0.12}s` }} />
                                        ))}
                                    </span>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                </section>

                {/* ── INGEST ── */}
                <section className="relative max-w-6xl mx-auto px-5 sm:px-6 pb-16">
                    <motion.div
                        ref={heroRef}
                        initial={{ opacity: 0, y: 22 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, ease: EASE, delay: 0.18 }}
                        className="mx-auto max-w-4xl"
                    >
                        <div className="cr-panel overflow-hidden">
                            {/* track header */}
                            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--line)] bg-[var(--panel-2)]">
                                <span className="cr-label">Input Source · 输入源</span>
                                <span className="flex items-center gap-2">
                                    <i
                                        className={cn("block w-1.5 h-1.5 rounded-full", !isDragActive && "cr-rec-dot")}
                                        style={{ background: isDragActive ? "var(--signal)" : "var(--rec)" }}
                                        aria-hidden
                                    />
                                    <span className="cr-label" style={isDragActive ? { color: "var(--signal)" } : undefined}>
                                        {isDragActive ? "Drop to Ingest" : "Ready"}
                                    </span>
                                </span>
                            </div>

                            {/* ruler */}
                            <div className="cr-ruler w-full opacity-50" aria-hidden />

                            {/* dropzone — the signature track */}
                            <div
                                {...getRootProps()}
                                aria-label="上传视频或音频文件"
                                className={cn(
                                    "cr-waverow cr-focusable relative cursor-pointer select-none px-4 py-11 sm:py-14 text-center transition-colors overflow-hidden",
                                    isDragActive && "cr-dragging",
                                )}
                            >
                                <input {...getInputProps()} />

                                {/* waveform backdrop */}
                                <div
                                    className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 flex items-center justify-center gap-[3px] h-24 px-8"
                                    aria-hidden
                                >
                                    {WAVE.map((h, i) => (
                                        <span
                                            key={i}
                                            className="cr-bar w-[3px] flex-none"
                                            style={{
                                                height: `${h * 100}%`,
                                                animationDelay: `${(i % 12) * 0.07}s`,
                                                animationDuration: `${0.9 + (i % 5) * 0.09}s`,
                                            }}
                                        />
                                    ))}
                                </div>

                                {/* sweeping sheen */}
                                <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
                                    <div className="cr-scan absolute inset-y-0 w-1/3" style={{ background: "linear-gradient(90deg, transparent, rgba(245,165,36,0.08), transparent)" }} />
                                </div>

                                {/* center content */}
                                <div className="relative z-10 flex flex-col items-center gap-4">
                                    <div
                                        className="w-14 h-14 rounded-xl flex items-center justify-center border transition-transform duration-300"
                                        style={{
                                            borderColor: isDragActive ? "var(--signal)" : "var(--line-2)",
                                            background: isDragActive ? "rgba(245,165,36,0.1)" : "rgba(255,255,255,0.02)",
                                            transform: isDragActive ? "scale(1.08)" : "scale(1)",
                                        }}
                                    >
                                        <UploadCloud className="w-6 h-6" style={{ color: isDragActive ? "var(--signal)" : "var(--dim)" }} strokeWidth={1.75} />
                                    </div>
                                    <div>
                                        <p className="text-lg font-semibold">
                                            {isDragActive ? "松开以导入" : "拖入视频或音频"}
                                        </p>
                                        <p className="mt-1 text-sm text-[var(--dim)]">或点击选择文件</p>
                                    </div>
                                    <p className="cr-label opacity-80">
                                        {`MP4 · MOV · WEBM · MP3 · WAV · ≤ ${MAX_FILE_SIZE_LABEL}`}
                                    </p>
                                </div>
                            </div>

                            {/* URL ingest */}
                            <div className="border-t border-[var(--line)] px-4 sm:px-5 py-5 space-y-4">
                                <form onSubmit={handleUrlSubmit} className="flex flex-col sm:flex-row gap-3">
                                    <div className="relative flex-1">
                                        <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--faint)" }} />
                                        <input
                                            type="text"
                                            inputMode="url"
                                            placeholder="粘贴 MP4 / MOV / WEBM / MP3 / WAV 直链…"
                                            aria-label="媒体直链"
                                            className="cr-mono w-full bg-[#0D1015] border border-[var(--line)] rounded-lg pl-9 pr-3 py-3 text-[13px] outline-none transition-colors placeholder:text-[var(--faint)] focus:border-[var(--signal)]"
                                            value={url}
                                            onChange={(e) => {
                                                setUrl(e.target.value);
                                                if (error) setError("");
                                            }}
                                        />
                                    </div>
                                    <motion.button
                                        type="submit"
                                        disabled={!url.trim()}
                                        whileTap={{ scale: 0.98 }}
                                        className="cr-btn cr-focusable inline-flex items-center justify-center gap-2 px-6 py-3 text-[#0B0D11] transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                                        style={{ background: "var(--signal)" }}
                                    >
                                        Ingest
                                        <ArrowRight className="w-4 h-4" />
                                    </motion.button>
                                </form>

                                {error ? (
                                    <motion.p
                                        initial={{ opacity: 0, y: -4 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="cr-mono text-xs"
                                        style={{ color: "var(--rec)" }}
                                    >
                                        {`! ${error}`}
                                    </motion.p>
                                ) : (
                                    <p className="cr-label opacity-70">
                                        直链需以 .mp4 .mov .webm .mp3 .wav 结尾
                                    </p>
                                )}

                                {/* sample */}
                                <button
                                    type="button"
                                    onClick={useSample}
                                    className="cr-focusable group w-full flex items-center gap-4 rounded-lg border border-dashed border-[var(--line-2)] px-4 py-3 text-left transition-colors hover:border-[var(--signal)]"
                                >
                                    <span
                                        className="w-9 h-9 rounded-lg flex items-center justify-center flex-none border"
                                        style={{ borderColor: "var(--line-2)", background: "rgba(255,255,255,0.02)" }}
                                    >
                                        <svg width="12" height="14" viewBox="0 0 14 16" fill="none" className="ml-0.5">
                                            <path d="M13 7.134a1 1 0 0 1 0 1.732l-11.5 6.64A1 1 0 0 1 0 14.639V1.361A1 1 0 0 1 1.5.495L13 7.134Z" fill="var(--signal)" />
                                        </svg>
                                    </span>
                                    <span className="flex-1 min-w-0">
                                        <span className="block text-sm font-semibold">用示例片段试用</span>
                                        <span className="cr-label block mt-1">Sample · 无需上传</span>
                                    </span>
                                    <ArrowRight className="w-4 h-4 flex-none transition-colors" style={{ color: "var(--faint)" }} />
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </section>

                {/* ── SIGNAL FLOW ── */}
                <section className="relative max-w-6xl mx-auto px-5 sm:px-6 py-14 sm:py-20 border-t border-[var(--line)]">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: "-80px" }}
                        transition={{ duration: 0.6, ease: EASE }}
                    >
                        <div className="flex items-center gap-3 mb-4">
                            <span className="cr-eyebrow">Signal Flow</span>
                            <span className="h-px flex-1 bg-[var(--line)]" />
                            <span className="cr-label">04 stages</span>
                        </div>
                        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                            从音频到成品字幕的四步
                        </h2>
                        <p className="mt-3 text-[var(--dim)] text-sm sm:text-base max-w-xl">
                            一条流水线跑完转写到导出，每一步都可控、可回退。
                        </p>

                        <div className="relative mt-10">
                            {/* connector line + travelling signal (desktop) */}
                            <div className="hidden lg:block absolute left-0 right-0 top-[30px] h-px bg-[var(--line)]">
                                <span className="cr-flow-dot" aria-hidden />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 lg:gap-6 relative">
                                {STEPS.map((s) => {
                                    const Icon = s.icon;
                                    return (
                                        <div key={s.n} className="cr-panel p-5 bg-[var(--panel)]">
                                            <div className="flex items-center justify-between">
                                                <span className="cr-mono text-xs" style={{ color: "var(--faint)" }}>{s.n}</span>
                                                <Icon className="w-4 h-4" style={{ color: "var(--signal)" }} strokeWidth={1.75} />
                                            </div>
                                            <div className="mt-7">
                                                <div className="cr-mono text-xs tracking-[0.16em]" style={{ color: "var(--dim)" }}>{s.en}</div>
                                                <div className="mt-1.5 text-lg font-semibold">{s.zh}</div>
                                                <p className="mt-2 text-xs text-[var(--dim)] leading-relaxed">{s.desc}</p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </motion.div>
                </section>

                {/* ── PREVIEW ── */}
                <section className="relative max-w-6xl mx-auto px-5 sm:px-6 py-14 sm:py-20 border-t border-[var(--line)]">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: "-80px" }}
                        transition={{ duration: 0.6, ease: EASE }}
                        className="flex flex-col items-center"
                    >
                        <div className="flex items-center gap-3 mb-4 w-full">
                            <span className="cr-eyebrow">Preview</span>
                            <span className="h-px flex-1 bg-[var(--line)]" />
                            <span className="cr-label">实时预览</span>
                        </div>
                        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-center">
                            功能齐全的编辑器
                        </h2>
                        <p className="mt-3 text-[var(--dim)] text-sm sm:text-base text-center max-w-lg mb-10 sm:mb-12">
                            编辑、样式、审核、导出 —— 一站式完成。
                        </p>

                        <div className="w-full">
                            <SubtitleSimulator />
                        </div>
                    </motion.div>
                </section>

                {/* ── CTA ── */}
                <section className="relative max-w-6xl mx-auto px-5 sm:px-6 py-16 sm:py-20 border-t border-[var(--line)]">
                    <motion.div
                        initial={{ opacity: 0, y: 22 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: "-80px" }}
                        transition={{ duration: 0.6, ease: EASE }}
                        className="flex flex-col items-center text-center"
                    >
                        <div className="flex items-center gap-3 mb-4">
                            <span className="cr-eyebrow">Start Session</span>
                        </div>
                        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                            准备给下一个视频加字幕了吗？
                        </h2>
                        <p className="mt-3 text-[var(--dim)] text-sm sm:text-base max-w-md">
                            拖入文件或粘贴链接 —— 几秒钟出字幕，而不是几小时。
                        </p>
                        <motion.button
                            onClick={scrollToIngest}
                            whileTap={{ scale: 0.98 }}
                            className="cr-btn cr-focusable mt-8 inline-flex items-center gap-2.5 px-7 py-3.5 text-[#0B0D11]"
                            style={{ background: "var(--signal)" }}
                        >
                            新建任务
                            <ArrowUp className="w-4 h-4" />
                        </motion.button>
                    </motion.div>
                </section>

                {/* ── FOOTER ── */}
                <footer className="relative border-t border-[var(--line)]">
                    <div className="max-w-6xl mx-auto px-5 sm:px-6 py-9 flex flex-col sm:flex-row items-center justify-between gap-5">
                        <div className="flex items-center gap-3">
                            <span className="cr-eq" aria-hidden>
                                {[0, 1, 2, 3].map((i) => (
                                    <i key={i} style={{ animationDelay: `${i * 0.14}s` }} />
                                ))}
                            </span>
                            <div>
                                <div className="cr-mono text-xs tracking-[0.22em]">SUBCRAFT</div>
                                <div className="cr-label mt-1">字幕工坊 · AI 字幕 · Whisper</div>
                            </div>
                        </div>

                        <div className="flex items-center gap-5 cr-mono text-xs" style={{ color: "var(--faint)" }}>
                            <span>TC {tc}</span>
                            <span>© {year}</span>
                        </div>
                    </div>
                </footer>
            </div>
        </MotionConfig>
    );
}
