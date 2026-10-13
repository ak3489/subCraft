"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import ImportView from "./ImportView";
import ProcessingView from "./ProcessingView";
import EditorView from "./EditorView";
import Logo from "./Logo";
import SettingsView from "./SettingsView";
import { KeyRound, History, Check, Trash2, Clock, Plus, Sparkles, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import Tooltip from "./Tooltip";
import { hasApiKey as detectApiKey, isLocalMode } from "@/lib/api-config";

export type AppStep = "import" | "processing" | "editor";

export interface HistoryEntry {
    id: string;
    title: string;
    date: string;
    stylePreset: string;
}

/* ── Job data persistence for URL routing ── */
const JOB_PREFIX = "substudio_job_";

function saveJobData(jId: string, data: { srtContent: string; words: unknown[]; stylePreset: string; source: string; isSample?: boolean }) {
    try { localStorage.setItem(`${JOB_PREFIX}${jId}`, JSON.stringify(data)); } catch { /* quota exceeded */ }
}

function loadJobData(jId: string): { srtContent: string; words: unknown[]; stylePreset: string; source: string; isSample?: boolean } | null {
    const raw = localStorage.getItem(`${JOB_PREFIX}${jId}`);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
}

const TIPS = [
    "支持任意兼容 OpenAI 的语音转写接口",
    "填写接口地址、API Key 和模型即可使用",
    "转写结果可导出 SRT / VTT 字幕",
    "还能把字幕直接压制进视频导出 MP4",
    "逐词时间戳，让字幕对齐更精准",
    "所有配置仅保存在你的浏览器本地",
    "开源、可自建部署的字幕工具",
];

/* ── Framer Motion page transition variants ── */
const pageVariants = {
    initial: { opacity: 0, scale: 0.97, filter: "blur(6px)" },
    animate: {
        opacity: 1,
        scale: 1,
        filter: "blur(0px)",
        transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
    },
    exit: {
        opacity: 0,
        scale: 0.97,
        filter: "blur(6px)",
        transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const },
    },
};

export default function SubStudioApp() {
    const [step, setStep] = useState<AppStep>("import");
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);

    // Toast state
    const [tipIndex, setTipIndex] = useState(0);
    const [tipVisible, setTipVisible] = useState(true);



    // Shared state
    const [videoFile, setVideoFile] = useState<File | null>(null);
    const [mediaUrl, setMediaUrl] = useState<string>("");
    const [jobId, setJobId] = useState<string>("");
    const [srtContent, setSrtContent] = useState<string>("");
    const [words, setWords] = useState<unknown[]>([]);
    const [stylePreset, setStylePreset] = useState<string>("classic");
    const [isSample, setIsSample] = useState(false);
    const [blobUrl, setBlobUrl] = useState<string | null>(null);
    const [settingsVariant, setSettingsVariant] = useState<"default" | "out-of-credits">("default");
    const [hasApiKey, setHasApiKey] = useState(false);
    const [localMode, setLocalMode] = useState(false);
    const [processingKey, setProcessingKey] = useState(0);
    const [freeUsed, setFreeUsed] = useState(false);

    const historyRef = useRef<HTMLDivElement>(null);
    const searchParams = useSearchParams();

    // Restore job from URL on mount
    useEffect(() => {
        const urlJobId = searchParams.get("jobId");
        if (!urlJobId) return;
        const data = loadJobData(urlJobId);
        if (data) {
            setJobId(urlJobId);
            setSrtContent(data.srtContent);
            setWords(data.words);
            setStylePreset(data.stylePreset);
            if (data.isSample) setIsSample(true);
            setStep("editor");
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Save job data + update URL when entering editor
    useEffect(() => {
        if (step === "editor" && jobId && srtContent) {
            const source = videoFile?.name || mediaUrl || "Unknown";
            saveJobData(jobId, { srtContent, words, stylePreset, source, isSample });
            window.history.replaceState(null, "", `?jobId=${jobId}`);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step, jobId]);

    // Handle browser back button
    useEffect(() => {
        const handlePopState = () => {
            const params = new URLSearchParams(window.location.search);
            if (!params.get("jobId")) {
                setStep("import");
            }
        };
        window.addEventListener("popstate", handlePopState);
        return () => window.removeEventListener("popstate", handlePopState);
    }, []);

    // Load history + credit state from localStorage
    useEffect(() => {
        const stored = localStorage.getItem("substudio_history");
        if (stored) {
            try {
                setHistoryEntries(JSON.parse(stored));
            } catch { /* ignore parse errors */ }
        }
        setHasApiKey(detectApiKey());
        setLocalMode(isLocalMode());
        setFreeUsed(localStorage.getItem("substudio_free_used") === "true");
    }, []);



    // Auto-rotate tips every 6 seconds — only when on processing step
    useEffect(() => {
        if (step !== "processing") return;
        const interval = setInterval(() => {
            cycleTip();
        }, 6000);
        return () => clearInterval(interval);
    }, [tipIndex, step]);

    const cycleTip = () => {
        setTipVisible(false);
        setTimeout(() => {
            setTipIndex((prev) => (prev + 1) % TIPS.length);
            setTipVisible(true);
        }, 300);
    };

    // Close history on outside click or Escape
    useEffect(() => {
        if (!isHistoryOpen) return;

        const handleClick = (e: MouseEvent) => {
            if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
                setIsHistoryOpen(false);
            }
        };
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setIsHistoryOpen(false);
        };

        document.addEventListener("mousedown", handleClick);
        document.addEventListener("keydown", handleKey);
        return () => {
            document.removeEventListener("mousedown", handleClick);
            document.removeEventListener("keydown", handleKey);
        };
    }, [isHistoryOpen]);

    const cleanTitle = (source: string): string => {
        if (!source || source === "Unknown") return "未命名项目";

        // File upload — strip extension and clean up
        if (source.includes('.') && !source.startsWith('http')) {
            return source.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
        }

        // Direct URL — use filename from path
        try {
            const url = new URL(source);
            const filename = url.pathname.split('/').pop() || '';
            if (filename && filename.includes('.')) {
                return filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
            }
            return url.hostname.replace('www.', '');
        } catch {
            return source.length > 40 ? source.slice(0, 40) + '...' : source;
        }
    };

    const saveToHistory = (jId: string, source: string) => {
        if (!jId) return;
        const entry: HistoryEntry = {
            id: jId,
            title: cleanTitle(source),
            date: new Date().toISOString(),
            stylePreset,
        };
        const updated = [entry, ...historyEntries].slice(0, 50);
        setHistoryEntries(updated);
        localStorage.setItem("substudio_history", JSON.stringify(updated));
    };

    const clearHistory = () => {
        setHistoryEntries([]);
        localStorage.removeItem("substudio_history");
    };

    const handleOutOfCredits = () => {
        setSettingsVariant("out-of-credits");
        setIsSettingsOpen(true);
    };

    const resetApp = () => {
        setVideoFile(null);
        setMediaUrl("");
        setJobId("");
        setSrtContent("");
        setWords([]);
        setStylePreset("classic");
        setIsSample(false);
        setBlobUrl(null);
        setStep("import");
        window.history.pushState(null, "", "/");
    };

    const handleProcessingComplete = (completedJobId: string) => {
        const source = videoFile?.name || mediaUrl || "Unknown";
        saveToHistory(completedJobId, source);
        // Refresh credit state after processing
        setHasApiKey(detectApiKey());
        setLocalMode(isLocalMode());
        setFreeUsed(localStorage.getItem("substudio_free_used") === "true");
        setStep("editor");
    };

    const formatDate = (iso: string) => {
        const d = new Date(iso);
        const now = new Date();
        const diffMs = now.getTime() - d.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return "刚刚";
        if (diffMins < 60) return `${diffMins} 分钟前`;
        if (diffHours < 24) return `${diffHours} 小时前`;
        if (diffDays < 7) return `${diffDays} 天前`;
        return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
    };



    const ready = hasApiKey || localMode;

    return (
        <div className="flex flex-col h-dvh w-full bg-background text-foreground overflow-hidden font-sans">
            {/* Nav Bar */}
            <motion.header
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="h-14 border-b border-border/60 flex items-center px-5 shrink-0 justify-between bg-card/80 backdrop-blur-xl text-card-foreground z-30 relative"
            >
                {/* Left — SubCraft */}
                <div className="flex items-center gap-3">
                    {/* SubCraft logo + name */}
                    <button onClick={resetApp} className="flex items-center gap-[6px] hover:opacity-80 transition-opacity">
                        <div className="w-7 h-7 flex items-center justify-center">
                            <Logo />
                        </div>
                        <h1 className="text-[17px] tracking-tight" style={{ fontFamily: "var(--font-outfit), 'Inter', sans-serif", fontWeight: 500 }}>SubCraft</h1>
                    </button>

                    {/* Separator + label */}
                    <div className="flex items-center gap-3 pl-3 border-l border-border/50">
                        <span className="text-xs font-medium text-muted-foreground">字幕工坊 · AI 字幕工作台</span>
                    </div>
                </div>

                {/* Center — Step Indicator */}
                <AnimatePresence>
                    {step !== "import" && (
                        <div className="hidden md:flex absolute inset-0 items-center justify-center pointer-events-none">
                            <motion.div
                                initial={{ opacity: 0, y: -8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] as const }}
                                className="flex items-center pointer-events-auto"
                            >
                                <NavStep current={step} target="processing" label="转写" num={1} />
                                <div className={cn(
                                    "w-8 h-px mx-1",
                                    step === "editor" ? "bg-foreground/20" : "bg-border/50"
                                )} />
                                <NavStep current={step} target="editor" label="编辑与导出" num={2} />
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                {/* Right actions */}
                <div className="flex items-center gap-1.5">
                    {/* New Generation button — only on editor step */}
                    <AnimatePresence>
                        {step === "editor" && (
                            <Tooltip label="新任务">
                                <motion.button
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.8 }}
                                    transition={{ duration: 0.2 }}
                                    onClick={resetApp}
                                    className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all duration-200"
                                >
                                    <Plus className="w-[18px] h-[18px]" />
                                </motion.button>
                            </Tooltip>
                        )}
                    </AnimatePresence>
                    {/* History Dropdown */}
                    <div className="relative flex items-center" ref={historyRef}>
                        <Tooltip label="上传历史">
                            <button
                                onClick={() => setIsHistoryOpen(!isHistoryOpen)}
                                className={cn(
                                    "p-2 rounded-lg transition-all duration-200",
                                    isHistoryOpen
                                        ? "text-foreground bg-muted shadow-sm"
                                        : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                                )}
                            >
                                <History className="w-[18px] h-[18px]" />
                            </button>
                        </Tooltip>

                        <AnimatePresence>
                            {isHistoryOpen && (
                                <motion.div
                                    initial={{ opacity: 0, y: -4, scale: 0.97 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: -4, scale: 0.97 }}
                                    transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                                    className="absolute right-0 top-full mt-2 w-80 bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden"
                                >
                                    <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                                        <h3 className="font-semibold text-sm text-foreground">历史记录</h3>
                                        {historyEntries.length > 0 && (
                                            <button
                                                onClick={clearHistory}
                                                className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                                清空
                                            </button>
                                        )}
                                    </div>

                                    <div className="max-h-[360px] overflow-y-auto custom-scrollbar">
                                        {historyEntries.length === 0 ? (
                                            <div className="px-4 py-10 text-center text-muted-foreground">
                                                <Clock className="w-8 h-8 mx-auto mb-3 opacity-40" />
                                                <p className="text-sm font-medium">暂无历史记录</p>
                                                <p className="text-xs mt-1 opacity-70">你的项目会显示在这里</p>
                                            </div>
                                        ) : (
                                            <div className="py-1">
                                                {historyEntries.map((entry, i) => (
                                                    <button
                                                        key={`${entry.id}-${i}`}
                                                        className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer border-b border-border/30 last:border-b-0 group/entry"
                                                        onClick={() => {
                                                            const data = loadJobData(entry.id);
                                                            if (data) {
                                                                setJobId(entry.id);
                                                                setSrtContent(data.srtContent);
                                                                setWords(data.words);
                                                                setStylePreset(data.stylePreset);
                                                                setIsSample(!!data.isSample);
                                                                setStep("editor");
                                                                setIsHistoryOpen(false);
                                                                window.history.replaceState(null, "", `?jobId=${entry.id}`);
                                                            } else {
                                                                // Data was cleared — remove stale entry
                                                                setHistoryEntries(prev => prev.filter((_, idx) => idx !== i));
                                                                const updated = historyEntries.filter((_, idx) => idx !== i);
                                                                localStorage.setItem("substudio_history", JSON.stringify(updated));
                                                            }
                                                        }}
                                                    >
                                                        <div className="flex items-center justify-between gap-3">
                                                            <div className="min-w-0 flex-1">
                                                                <p className="text-sm font-medium text-foreground truncate">
                                                                    {entry.title}
                                                                </p>
                                                                <div className="flex items-center gap-2 mt-1">
                                                                    <span className="text-[10px] uppercase font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                                                        {entry.stylePreset}
                                                                    </span>
                                                                    <span className="text-xs text-muted-foreground">
                                                                        {formatDate(entry.date)}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            <svg className="w-4 h-4 text-muted-foreground/0 group-hover/entry:text-muted-foreground/60 transition-colors shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                <path d="M9 18l6-6-6-6" />
                                                            </svg>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    <Tooltip label={ready ? "接口设置" : freeUsed ? "请填写接口以继续" : "尚未配置接口"}>
                        <button
                            onClick={() => {
                                setSettingsVariant(freeUsed && !ready ? "out-of-credits" : "default");
                                setIsSettingsOpen(true);
                            }}
                            className="relative p-2 text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-lg transition-all duration-200"
                        >
                            <KeyRound className="w-[18px] h-[18px]" />
                            {/* Credit status dot */}
                            {!ready && (
                                <span className={cn(
                                    "absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card",
                                    freeUsed ? "bg-amber-500" : "bg-green-500"
                                )} />
                            )}
                        </button>
                    </Tooltip>

                    <Tooltip label="使用说明">
                        <Link
                            href="/guide"
                            aria-label="使用说明"
                            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-lg transition-all duration-200"
                        >
                            <BookOpen className="w-[18px] h-[18px]" />
                        </Link>
                    </Tooltip>
                </div>
            </motion.header>

            <main className="flex-1 overflow-auto flex relative">
                <AnimatePresence mode="wait">
                    {step === "import" && (
                        <motion.div
                            key="import"
                            variants={pageVariants}
                            initial="initial"
                            animate="animate"
                            exit="exit"
                            className="flex-1 flex"
                        >
                            <ImportView
                                onNext={() => setStep("processing")}
                                setVideoFile={setVideoFile}
                                setMediaUrl={setMediaUrl}
                                setIsSample={setIsSample}
                            />
                        </motion.div>
                    )}
                    {step === "processing" && (
                        <motion.div
                            key="processing"
                            variants={pageVariants}
                            initial="initial"
                            animate="animate"
                            exit="exit"
                            className="flex-1 flex"
                        >
                            <ProcessingView
                                key={processingKey}
                                onNext={handleProcessingComplete}
                                videoFile={videoFile}
                                mediaUrl={mediaUrl}
                                setJobId={setJobId}
                                setSrtContent={setSrtContent}
                                setWords={setWords}
                                isSample={isSample}
                                onOutOfCredits={handleOutOfCredits}
                                onReset={resetApp}
                                setBlobUrl={setBlobUrl}
                            />
                        </motion.div>
                    )}
                    {step === "editor" && (
                        <motion.div
                            key="editor"
                            variants={pageVariants}
                            initial="initial"
                            animate="animate"
                            exit="exit"
                            className="flex-1 flex"
                        >
                            <EditorView
                                onNewProject={resetApp}
                                jobId={jobId}
                                srtContent={srtContent}
                                setSrtContent={setSrtContent}
                                words={words}
                                stylePreset={stylePreset}
                                setStylePreset={setStylePreset}
                                isSample={isSample}
                                blobUrl={blobUrl}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>

            {/* Tips Toast — Only during processing */}
            <AnimatePresence>
                {step === "processing" && (
                    <div className="fixed bottom-5 left-0 right-0 z-40 flex justify-center pointer-events-none">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 20 }}
                            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] as const }}
                            className="pointer-events-auto"
                        >
                            <button
                                onClick={cycleTip}
                                className="group flex items-center gap-2.5 bg-card/90 backdrop-blur-xl border border-border/60 shadow-lg hover:shadow-xl px-4 py-2.5 rounded-full transition-all duration-300 hover:border-border cursor-pointer"
                            >
                                <Sparkles className="w-4 h-4 shrink-0 text-muted-foreground/70 group-hover:text-foreground transition-colors" />
                                <span
                                    className={cn(
                                        "text-xs font-medium text-muted-foreground group-hover:text-foreground whitespace-nowrap transition-all duration-300",
                                        tipVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
                                    )}
                                >
                                    {TIPS[tipIndex]}
                                </span>
                            </button>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <SettingsView isOpen={isSettingsOpen} onClose={() => {
                setIsSettingsOpen(false);
                setSettingsVariant("default");
                // Refresh credit state after settings closes (user may have added key)
                const keyNow = detectApiKey();
                const localNow = isLocalMode();
                if ((keyNow || localNow) && !ready && step === "processing") {
                    // 配置就绪（本地模式或刚填了 Key）——自动重试
                    setProcessingKey(k => k + 1);
                }
                setHasApiKey(keyNow);
                setLocalMode(localNow);
            }} variant={settingsVariant} />
        </div>
    );
}

/* Minimal step indicator for nav bar */
function NavStep({ current, target, label, num }: {
    current: AppStep;
    target: AppStep;
    label: string;
    num: number;
}) {
    const stepOrder: AppStep[] = ["processing", "editor"];
    const currentIndex = stepOrder.indexOf(current);
    const targetIndex = stepOrder.indexOf(target);

    const isPast = targetIndex < currentIndex;
    const isCurrent = current === target;

    return (
        <div className="flex items-center gap-2">
            <div
                className={cn(
                    "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all duration-300 border",
                    isPast
                        ? "border-green-500/40 bg-green-500/10 text-green-500"
                        : isCurrent
                            ? "border-foreground/30 bg-foreground text-background"
                            : "border-border/60 text-muted-foreground/50"
                )}
            >
                {isPast ? <Check className="w-2.5 h-2.5" /> : num}
            </div>
            <span
                className={cn(
                    "text-xs font-medium transition-colors duration-300",
                    isPast
                        ? "text-muted-foreground"
                        : isCurrent
                            ? "text-foreground"
                            : "text-muted-foreground/50"
                )}
            >
                {label}
            </span>
        </div>
    );
}
