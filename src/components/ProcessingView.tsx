"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, MotionConfig } from "framer-motion";
import { CheckCircle2, AlertCircle, KeyRound, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { getApiConfig } from "@/lib/api-config";

interface ProcessingViewProps {
    onNext: (jobId: string) => void;
    videoFile: File | null;
    mediaUrl: string;
    setJobId: (id: string) => void;
    setSrtContent: (srt: string) => void;
    setWords: (words: unknown[]) => void;
    isSample: boolean;
    onOutOfCredits: () => void;
    onReset: () => void;
    setBlobUrl: (url: string | null) => void;
}

const EASE = [0.22, 1, 0.36, 1] as const;

/* ── Animation variants ── */
const containerVariants = {
    hidden: {},
    visible: {
        transition: { staggerChildren: 0.1, delayChildren: 0.15 },
    },
};

const childFadeUp = {
    hidden: { opacity: 0, y: 16 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.5, ease: EASE },
    },
};

const stageItemVariant = {
    hidden: { opacity: 0, x: -12 },
    visible: {
        opacity: 1,
        x: 0,
        transition: { duration: 0.4, ease: EASE },
    },
};

const checkPop = {
    initial: { scale: 0, opacity: 0 },
    animate: {
        scale: 1,
        opacity: 1,
        transition: { type: "spring" as const, stiffness: 500, damping: 15 },
    },
};

export default function ProcessingView({ onNext, videoFile, mediaUrl, setJobId, setSrtContent, setWords, isSample, onOutOfCredits, onReset, setBlobUrl }: ProcessingViewProps) {
    const [currentStage, setCurrentStage] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const hasStarted = useRef(false);

    const stages = [
        { id: "ingest", en: "INGEST", label: "导入视频" },
        { id: "extract", en: "EXTRACT", label: "提取音频" },
        { id: "transcribe", en: "TRANSCRIBE", label: "语音转写" },
        { id: "format", en: "FORMAT", label: "整理字幕" },
    ];

    useEffect(() => {
        if (hasStarted.current) return;
        hasStarted.current = true;

        const processVideo = async () => {
            try {
                const { apiKey, baseUrl, model, mode } = getApiConfig();
                const freeUsed = localStorage.getItem("substudio_free_used") === "true";

                if (mode !== "local" && !apiKey && freeUsed && !isSample) {
                    setError("out-of-credits");
                    onOutOfCredits();
                    return;
                }

                setError(null);
                setCurrentStage(0);

                // Stage 0: Ingest Video
                let processResponse;
                let blobUrl: string | null = null;
                if (videoFile) {
                    // 先探测对象存储是否可用；自建服务器通常未配置 Blob，直接上传即可
                    let blobEnabled = false;
                    try {
                        const statusRes = await fetch('/api/upload');
                        if (statusRes.ok) {
                            blobEnabled = (await statusRes.json())?.enabled === true;
                        }
                    } catch {
                        // 探测失败则按不可用处理
                    }

                    if (blobEnabled) {
                        try {
                            const { upload } = await import('@vercel/blob/client');
                            const ext = videoFile.name.split('.').pop()?.toLowerCase() || 'mp4';
                            const nameWithoutExt = videoFile.name.replace(/\.[^.]+$/, '');
                            const slug = nameWithoutExt.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
                            const blob = await upload(`${slug}-${crypto.randomUUID()}.${ext}`, videoFile, {
                                access: 'private',
                                handleUploadUrl: '/api/upload',
                            });
                            blobUrl = blob.url;
                            setBlobUrl(blobUrl);
                        } catch (err) {
                            // Blob 已启用却失败，通常是配置或网络问题，直接报错
                            const msg = err instanceof Error ? err.message : String(err);
                            throw new Error(`上传失败：${msg}`);
                        }
                    }

                    if (blobUrl) {
                        processResponse = await fetch("/api/process", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ blobUrl }),
                        });
                    } else {
                        const formData = new FormData();
                        formData.append("file", videoFile);
                        processResponse = await fetch("/api/process", {
                            method: "POST",
                            body: formData,
                        });
                    }
                } else if (mediaUrl) {
                    processResponse = await fetch("/api/process", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ mediaUrl }),
                    });
                } else {
                    throw new Error("未提供视频");
                }

                if (!processResponse.ok) {
                    const text = await processResponse.text();
                    let errorMessage = "视频导入失败";
                    try {
                        const data = JSON.parse(text);
                        if (data.error) errorMessage = data.error;
                    } catch {
                        errorMessage = `服务器返回错误：${processResponse.status} ${processResponse.statusText}。响应：${text.substring(0, 100)}`;
                    }
                    throw new Error(errorMessage);
                }

                const processData = await processResponse.json();
                const jobId = processData.jobId;
                setJobId(jobId);

                if (!blobUrl && processData.blobUrl) {
                    blobUrl = processData.blobUrl;
                    setBlobUrl(blobUrl);
                }

                // Stages 1-3 handled by /api/transcribe
                setCurrentStage(1);

                const transcribeResponse = await fetch("/api/transcribe", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ jobId, apiKey, baseUrl, model, blobUrl, mode }),
                });

                if (!transcribeResponse.ok) {
                    const text = await transcribeResponse.text();
                    let errorMessage = "音频转写失败";
                    try {
                        const data = JSON.parse(text);
                        if (data.error) errorMessage = data.error;
                    } catch {
                        errorMessage = `服务器返回错误：${transcribeResponse.status} ${transcribeResponse.statusText}。响应：${text.substring(0, 100)}`;
                    }

                    if (transcribeResponse.status === 401) {
                        throw new Error("缺少 API Key！请点击右上角的钥匙图标进行设置，或在服务端配置环境变量。");
                    }
                    throw new Error(errorMessage);
                }

                const transcribeData = await transcribeResponse.json();
                setSrtContent(transcribeData.srtContent);
                setWords(transcribeData.words);

                if (mode !== "local" && !apiKey && !isSample) {
                    localStorage.setItem("substudio_free_used", "true");
                }

                setCurrentStage(4);

                setTimeout(() => {
                    onNext(jobId);
                }, 1000);

            } catch (err: unknown) {
                console.error("Processing caught error:", err);
                setError(err instanceof Error ? err.message : "发生未知错误");
            }
        };

        processVideo();
    }, [videoFile, mediaUrl, isSample, onNext, onOutOfCredits, setBlobUrl, setJobId, setSrtContent, setWords]);

    const isComplete = currentStage >= stages.length;
    const isProcessing = currentStage < stages.length && !error;
    const isOutOfCredits = error === "out-of-credits";

    const headerStatus = isOutOfCredits ? "SETUP" : error ? "HALT" : isComplete ? "COMPLETE" : "PROCESSING";
    const headerColor = error ? "var(--rec)" : isComplete ? "var(--level)" : "var(--signal-2)";

    const title = isOutOfCredits ? "尚未配置接口" : error ? "处理失败" : isComplete ? "完成！" : "正在处理视频";
    const message = isOutOfCredits
        ? "请先填写接口地址、API Key 和模型，才能开始转写。"
        : error
            ? error
            : isComplete
                ? "正在打开编辑器..."
                : "AI 正在分析你的视频，请稍候...";

    return (
        <div className="cr relative flex-1 flex items-center justify-center px-5 sm:px-6 py-10">
            {/* control-room backdrop */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
                <div className="absolute inset-0 cr-grid-bg cr-fade-mask opacity-40" />
            </div>

            <MotionConfig reducedMotion="user">
                <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    animate="visible"
                    className="relative w-full max-w-lg"
                >
                    <div className="cr-panel overflow-hidden">
                        {/* ── monitor header ── */}
                        <div className="relative flex items-center justify-between px-4 py-3 border-b border-[var(--line)] bg-[var(--panel-2)]">
                            {isProcessing && (
                                <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
                                    <div className="cr-scan absolute inset-y-0 w-1/3" style={{ background: "linear-gradient(90deg, transparent, rgba(245,165,36,0.10), transparent)" }} />
                                </div>
                            )}
                            <span className="cr-eyebrow relative">Session · {headerStatus}</span>
                            <span className="relative flex items-center gap-2">
                                <i
                                    className={cn("block w-1.5 h-1.5 rounded-full", isProcessing && "cr-rec-dot")}
                                    style={{ background: headerColor }}
                                    aria-hidden
                                />
                                <span className="cr-mono text-xs" style={{ color: headerColor }}>
                                    {error ? "ERR" : isComplete ? "OK" : `0${Math.min(currentStage + 1, stages.length)}/${String(stages.length).padStart(2, "0")}`}
                                </span>
                            </span>
                        </div>

                        {/* ── hero state ── */}
                        <motion.div variants={childFadeUp} className="px-6 pt-9 pb-8 flex flex-col items-center text-center">
                            <div className="relative w-24 h-24 flex items-center justify-center">
                                <AnimatePresence mode="wait">
                                    {isOutOfCredits ? (
                                        <motion.div
                                            key="credits"
                                            initial={{ scale: 0, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            transition={{ type: "spring", stiffness: 400, damping: 15 }}
                                            className="w-20 h-20 rounded-2xl flex items-center justify-center border"
                                            style={{ borderColor: "var(--line-2)", background: "rgba(245,165,36,0.08)" }}
                                        >
                                            <KeyRound className="w-9 h-9" style={{ color: "var(--signal)" }} strokeWidth={1.75} />
                                        </motion.div>
                                    ) : error ? (
                                        <motion.div
                                            key="error"
                                            initial={{ scale: 0, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            transition={{ type: "spring", stiffness: 400, damping: 15 }}
                                            className="w-20 h-20 rounded-2xl flex items-center justify-center border"
                                            style={{ borderColor: "rgba(255,90,95,0.4)", background: "rgba(255,90,95,0.08)" }}
                                        >
                                            <AlertCircle className="w-9 h-9" style={{ color: "var(--rec)" }} strokeWidth={1.75} />
                                        </motion.div>
                                    ) : isComplete ? (
                                        <motion.div
                                            key="complete"
                                            initial={{ scale: 0, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            transition={{ type: "spring", stiffness: 400, damping: 15 }}
                                            className="w-20 h-20 rounded-2xl flex items-center justify-center border"
                                            style={{ borderColor: "rgba(91,217,140,0.4)", background: "rgba(91,217,140,0.08)" }}
                                        >
                                            <CheckCircle2 className="w-9 h-9" style={{ color: "var(--level)" }} strokeWidth={1.75} />
                                        </motion.div>
                                    ) : (
                                        <motion.div
                                            key="waveform"
                                            initial={{ opacity: 0, scale: 0.85 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            transition={{ duration: 0.5, ease: EASE }}
                                            className="flex items-end justify-center gap-[5px] h-16"
                                        >
                                            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                                                <span
                                                    key={i}
                                                    className="cr-bar w-[5px]"
                                                    style={{ height: "100%", animationDelay: `${i * 0.1}s` }}
                                                />
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            <div className="mt-6 space-y-2">
                                <AnimatePresence mode="wait">
                                    <motion.h2
                                        key={title}
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -8 }}
                                        transition={{ duration: 0.3 }}
                                        className="text-2xl font-bold tracking-tight"
                                    >
                                        {title}
                                    </motion.h2>
                                </AnimatePresence>
                                <AnimatePresence mode="wait">
                                    <motion.p
                                        key={message}
                                        initial={{ opacity: 0, y: 6 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -6 }}
                                        transition={{ duration: 0.3, delay: 0.05 }}
                                        className="text-sm leading-relaxed max-w-sm mx-auto"
                                        style={{ color: "var(--dim)" }}
                                    >
                                        {message}
                                    </motion.p>
                                </AnimatePresence>
                            </div>

                            {/* action buttons */}
                            {error && !isOutOfCredits && (
                                <motion.div
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.3, delay: 0.15 }}
                                    className="pt-6"
                                >
                                    <button
                                        onClick={onReset}
                                        className="cr-btn cr-focusable inline-flex items-center gap-2 px-5 py-2.5 text-[#0B0D11]"
                                        style={{ background: "var(--signal)" }}
                                    >
                                        <ArrowLeft className="w-3.5 h-3.5" />
                                        返回重试
                                    </button>
                                </motion.div>
                            )}
                            {isOutOfCredits && (
                                <motion.div
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.3, delay: 0.15 }}
                                    className="pt-6 flex items-center justify-center gap-3"
                                >
                                    <button
                                        onClick={onReset}
                                        className="cr-btn cr-focusable inline-flex items-center gap-1.5 px-4 py-2.5 border"
                                        style={{ borderColor: "var(--line-2)", color: "var(--dim)" }}
                                    >
                                        <ArrowLeft className="w-3.5 h-3.5" />
                                        返回
                                    </button>
                                    <button
                                        onClick={onOutOfCredits}
                                        className="cr-btn cr-focusable inline-flex items-center gap-1.5 px-4 py-2.5 text-[#0B0D11]"
                                        style={{ background: "var(--signal)" }}
                                    >
                                        <KeyRound className="w-3.5 h-3.5" />
                                        填写接口
                                    </button>
                                </motion.div>
                            )}
                        </motion.div>

                        {/* ── signal chain / stage track ── */}
                        <motion.div variants={childFadeUp} className="border-t border-[var(--line)] bg-[var(--panel-2)] px-4 sm:px-5 py-4 space-y-3">
                            {stages.map((stage, index) => {
                                const isCompletedStage = currentStage > index;
                                const isCurrentStage = currentStage === index && !error;
                                const isErrorStage = !!error && currentStage === index;
                                const isPending = currentStage < index || (currentStage === index && error);

                                const labelColor = isCompletedStage
                                    ? "var(--fg)"
                                    : isCurrentStage
                                        ? "var(--signal)"
                                        : isErrorStage
                                            ? "var(--rec)"
                                            : "var(--faint)";

                                return (
                                    <motion.div
                                        key={stage.id}
                                        variants={stageItemVariant}
                                        className={cn("flex items-center gap-3 transition-opacity duration-300", isPending && "opacity-50")}
                                    >
                                        <span className="cr-mono text-[11px] w-6 shrink-0" style={{ color: "var(--faint)" }}>
                                            {String(index + 1).padStart(2, "0")}
                                        </span>

                                        <span className="flex-1 min-w-0 flex items-center gap-2">
                                            <span className="text-sm font-medium transition-colors duration-300" style={{ color: labelColor }}>
                                                {stage.label}
                                            </span>
                                            <span className="cr-label hidden sm:inline">{stage.en}</span>
                                            <span className="h-px flex-1" style={{ background: "var(--line)" }} />
                                        </span>

                                        <span className="shrink-0 flex items-center justify-center w-5 h-5">
                                            <AnimatePresence mode="wait">
                                                {isCompletedStage ? (
                                                    <motion.div key="check" {...checkPop}>
                                                        <CheckCircle2 className="w-4 h-4" style={{ color: "var(--level)" }} />
                                                    </motion.div>
                                                ) : isCurrentStage ? (
                                                    <motion.div
                                                        key="pulse"
                                                        initial={{ scale: 0 }}
                                                        animate={{ scale: 1 }}
                                                        transition={{ type: "spring", stiffness: 400, damping: 15 }}
                                                        className="w-2.5 h-2.5 rounded-full"
                                                        style={{ background: "var(--signal)", boxShadow: "0 0 8px 2px rgba(245,165,36,0.35)" }}
                                                    />
                                                ) : isErrorStage ? (
                                                    <motion.div key="error" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 400, damping: 15 }}>
                                                        <AlertCircle className="w-4 h-4" style={{ color: "var(--rec)" }} />
                                                    </motion.div>
                                                ) : (
                                                    <motion.span key="pending" className="block w-1.5 h-1.5 rounded-full" style={{ background: "var(--line-2)" }} />
                                                )}
                                            </AnimatePresence>
                                        </span>
                                    </motion.div>
                                );
                            })}

                            {/* stage progress bar */}
                            <div className="pt-1">
                                <div className="h-1 rounded-full overflow-hidden" style={{ background: "var(--line)" }}>
                                    <motion.div
                                        className="h-full rounded-full"
                                        style={{ background: error ? "var(--rec)" : "var(--signal)" }}
                                        initial={{ width: "0%" }}
                                        animate={{ width: `${Math.min(currentStage / stages.length, 1) * 100}%` }}
                                        transition={{ duration: 0.5, ease: EASE }}
                                    />
                                </div>
                            </div>
                        </motion.div>
                    </div>

                    {/* footer note */}
                    <AnimatePresence>
                        {isProcessing && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.4, delay: 0.2 }}
                                className="mt-4 flex items-center justify-center gap-2"
                            >
                                <span className="cr-eq" aria-hidden>
                                    {[0, 1, 2, 3, 4].map((i) => (
                                        <i key={i} style={{ animationDelay: `${i * 0.12}s` }} />
                                    ))}
                                </span>
                                <span className="cr-label">Whisper Engine · 本地 / 在线</span>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>
            </MotionConfig>
        </div>
    );
}
