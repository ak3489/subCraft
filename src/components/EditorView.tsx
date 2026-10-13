import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, ListTodo, AlertTriangle, MonitorPlay, Download, ChevronDown, Loader2, CheckCircle2, Search, Copy, Check, ArrowLeftRight, Clock, Languages, Undo2, AudioLines } from "lucide-react";
import { cn } from "@/lib/utils";
import { getTranslateConfig, getDubConfig } from "@/lib/api-config";
import Tooltip from "./Tooltip";

interface Subtitle {
    id: number;
    start: string;
    end: string;
    text: string;
    confidence: number;
}

interface EditorViewProps {
    onNewProject: () => void;
    jobId: string;
    srtContent: string;
    setSrtContent: (srt: string) => void;
    words: unknown[];
    stylePreset: string;
    setStylePreset: (style: string) => void;
    isSample?: boolean;
    blobUrl?: string | null;
}

function parseTime(timeStr: string): number {
    const [h, m, s_ms] = timeStr.split(':');
    if (!s_ms) return 0;
    const [s, ms] = s_ms.split(',');
    return (parseInt(h) * 3600) + (parseInt(m) * 60) + parseInt(s) + (parseInt(ms) / 1000);
}

function formatTime(seconds: number): string {
    const hh = String(Math.floor(seconds / 3600)).padStart(2, '0');
    const mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
    const ss = String(Math.floor(seconds % 60)).padStart(2, '0');
    const ms = String(Math.floor((seconds % 1) * 1000)).padStart(3, '0');
    return `${hh}:${mm}:${ss},${ms}`;
}

function shiftTime(timeStr: string, deltaMs: number): string {
    const seconds = parseTime(timeStr) + deltaMs / 1000;
    return formatTime(Math.max(0, seconds));
}

/* ── Aspect ratio options ── */
const aspectRatios = [
    { id: "original", label: "自动", ratio: null },
    { id: "16:9", label: "16:9", ratio: 16 / 9 },
    { id: "9:16", label: "9:16", ratio: 9 / 16 },
    { id: "1:1", label: "1:1", ratio: 1 },
    { id: "4:5", label: "4:5", ratio: 4 / 5 },
] as const;

/* ── Animation variants ── */
const panelSlideLeft = {
    hidden: { opacity: 0, x: -24 },
    visible: {
        opacity: 1,
        x: 0,
        transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const },
    },
};

const panelSlideRight = {
    hidden: { opacity: 0, x: 24 },
    visible: {
        opacity: 1,
        x: 0,
        transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const, delay: 0.1 },
    },
};

const subtitleCardVariant = {
    hidden: { opacity: 0, y: 12 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const },
    },
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function EditorView({ onNewProject: _onNewProject, jobId, srtContent, setSrtContent, words: _words, stylePreset, setStylePreset, isSample, blobUrl }: EditorViewProps) {
    const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
    const [isPlaying, setIsPlaying] = useState(false);
    const [showReviewQueue, setShowReviewQueue] = useState(false);
    const [activeId, setActiveId] = useState<number | null>(null);
    const [nearestId, setNearestId] = useState<number | null>(null);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);

    // Export dropdown state
    const [isExportOpen, setIsExportOpen] = useState(false);
    const [downloading, setDownloading] = useState<string | null>(null);
    const [burnProgress, setBurnProgress] = useState<{ stage: string; progress: number } | null>(null);

    // Toast notifications
    const [toasts, setToasts] = useState<Array<{ id: number; message: string; type: 'success' | 'error' }>>([]);
    const toastId = useRef(0);
    const showToast = (message: string, type: 'success' | 'error' = 'success') => {
        const id = ++toastId.current;
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
    };

    // Video info & enhancement
    const [videoHeight, setVideoHeight] = useState<number>(0);
    const [upscaleTarget, setUpscaleTarget] = useState<number | null>(null);
    const [videoError, setVideoError] = useState(false);

    const videoRef = useRef<HTMLVideoElement>(null);
    const exportRef = useRef<HTMLDivElement>(null);

    // Search, copy, find-replace state
    const [searchQuery, setSearchQuery] = useState("");
    const [copied, setCopied] = useState(false);
    const [showFindReplace, setShowFindReplace] = useState(false);
    const [findText, setFindText] = useState("");
    const [replaceText, setReplaceText] = useState("");

    // Aspect ratio state
    const [aspectRatio, setAspectRatio] = useState<string>("original");

    // AI translation state
    const [isTranslating, setIsTranslating] = useState(false);
    const [translated, setTranslated] = useState(false);
    const originalSubtitlesRef = useRef<Subtitle[] | null>(null);

    const stylePresets = [
        { id: "classic", name: "经典", desc: "标准底部字幕" },
        { id: "tiktok", name: "TikTok", desc: "黄色高亮，逐词显示" },
        { id: "box", name: "现代色块", desc: "带实色背景的文字" },
        { id: "cinematic", name: "电影感", desc: "柔和的投影效果" },
        { id: "outline", name: "描边", desc: "白字黑边" },
        { id: "bold-center", name: "粗体居中", desc: "大号居中，带发光" },
    ];

    // Get video resolution client-side from the <video> element
    const handleVideoMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
        const video = e.currentTarget;
        if (video.videoHeight > 0) setVideoHeight(video.videoHeight);
    };

    // Parse SRT
    useEffect(() => {
        if (!srtContent) return;
        const blocks = srtContent.trim().split(/\n\s*\n/);
        const parsed: Subtitle[] = blocks.map(block => {
            const lines = block.split('\n');
            const id = parseInt(lines[0]);
            const times = lines[1].split(' --> ');
            const text = lines.slice(2).join('\n');
            const confidence = Math.random() > 0.9 ? 0.7 : 0.95;
            return { id, start: times[0], end: times[1], text, confidence };
        });
        setSubtitles(parsed);
        if (parsed.length > 0) setActiveId(parsed[0].id);
    }, [srtContent]);

    // Close export dropdown on outside click / Escape
    useEffect(() => {
        if (!isExportOpen) return;
        const handleClick = (e: MouseEvent) => {
            if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
                setIsExportOpen(false);
            }
        };
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setIsExportOpen(false);
        };
        document.addEventListener("mousedown", handleClick);
        document.addEventListener("keydown", handleKey);
        return () => {
            document.removeEventListener("mousedown", handleClick);
            document.removeEventListener("keydown", handleKey);
        };
    }, [isExportOpen]);

    // Filtered subtitles based on search
    const filteredSubtitles = subtitles.filter(s => {
        if (showReviewQueue && s.confidence >= 0.8) return false;
        if (searchQuery && !s.text.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        return true;
    });

    // Keyboard shortcuts
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement)?.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA") return;

            switch (e.key) {
                case " ":
                    e.preventDefault();
                    togglePlay();
                    break;
                case "j":
                    if (videoRef.current) videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 5);
                    break;
                case "l":
                    if (videoRef.current) videoRef.current.currentTime = Math.min(duration, videoRef.current.currentTime + 5);
                    break;
                case "ArrowUp": {
                    e.preventDefault();
                    const idx = filteredSubtitles.findIndex(s => s.id === activeId);
                    if (idx > 0) {
                        const prev = filteredSubtitles[idx - 1];
                        setActiveId(prev.id);
                        if (videoRef.current) videoRef.current.currentTime = parseTime(prev.start);
                        document.getElementById(`sub-${prev.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                    }
                    break;
                }
                case "ArrowDown": {
                    e.preventDefault();
                    const idx = filteredSubtitles.findIndex(s => s.id === activeId);
                    if (idx < filteredSubtitles.length - 1) {
                        const next = filteredSubtitles[idx + 1];
                        setActiveId(next.id);
                        if (videoRef.current) videoRef.current.currentTime = parseTime(next.start);
                        document.getElementById(`sub-${next.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                    }
                    break;
                }
            }
        };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [activeId, filteredSubtitles, duration]);

    // Copy transcript to clipboard
    const handleCopyTranscript = async () => {
        const text = filteredSubtitles.map(s => s.text).join("\n");
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // Stats
    const totalWords = subtitles.reduce((acc, s) => acc + s.text.split(/\s+/).filter(Boolean).length, 0);
    const totalDurationSec = subtitles.length > 0
        ? parseTime(subtitles[subtitles.length - 1].end) - parseTime(subtitles[0].start)
        : 0;
    const statsMins = Math.floor(totalDurationSec / 60);
    const statsSecs = Math.floor(totalDurationSec % 60);

    // Find & replace match count
    const findMatchCount = findText
        ? subtitles.reduce((count, s) => {
            const regex = new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
            return count + (s.text.match(regex)?.length ?? 0);
        }, 0)
        : 0;

    // Handle Time Update
    const handleTimeUpdate = () => {
        if (!videoRef.current) return;
        const time = videoRef.current.currentTime;
        setCurrentTime(time);

        const active = filteredSubtitles.find(s => {
            const startStr = parseTime(s.start);
            const endStr = parseTime(s.end);
            return time >= startStr && time <= endStr;
        });

        if (active) {
            if (active.id !== activeId) {
                setActiveId(active.id);
                setNearestId(null);
                const el = document.getElementById(`sub-${active.id}`);
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        } else if (filteredSubtitles.length > 0) {
            // No exact match — find the closest filtered subtitle
            setActiveId(null);
            let closest = filteredSubtitles[0];
            let closestDist = Infinity;
            for (const s of filteredSubtitles) {
                const start = parseTime(s.start);
                const end = parseTime(s.end);
                const mid = (start + end) / 2;
                const dist = Math.abs(time - mid);
                if (dist < closestDist) {
                    closestDist = dist;
                    closest = s;
                }
            }
            if (closest.id !== nearestId) {
                setNearestId(closest.id);
                const el = document.getElementById(`sub-${closest.id}`);
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    };

    const togglePlay = () => {
        if (videoRef.current) {
            if (isPlaying) videoRef.current.pause();
            else videoRef.current.play();
            setIsPlaying(!isPlaying);
        }
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const time = Number(e.target.value);
        if (videoRef.current) {
            videoRef.current.currentTime = time;
            setCurrentTime(time);
        }
    };

    const needsReviewCount = subtitles.filter(s => s.confidence < 0.8).length;

    // Get current subtitle text
    const currentSubtitle = subtitles.find(s => {
        const start = parseTime(s.start);
        const end = parseTime(s.end);
        return currentTime >= start && currentTime <= end;
    });

    const displayText = currentSubtitle?.text || "";

    // Word-level highlight index for TikTok style
    const getHighlightedWordIndex = (sub: Subtitle, time: number): number => {
        const start = parseTime(sub.start);
        const end = parseTime(sub.end);
        const dur = end - start;
        if (dur <= 0) return 0;
        const progress = (time - start) / dur;
        const words = sub.text.split(/\s+/);
        return Math.min(Math.floor(progress * words.length), words.length - 1);
    };

    // ---- Export Logic ----
    const downloadStringAsFile = (content: string, filename: string, type: string) => {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    };

    const convertSrtToVtt = (srt: string) => {
        let vtt = "WEBVTT\n\n";
        vtt += srt.replace(/,/g, '.');
        return vtt;
    };

    // 读取「JSON 进度行 + 结尾二进制视频」的流式响应，返回视频 Blob
    const readBinaryStream = async (
        res: Response,
        onProgress: (p: { stage: string; progress: number }) => void,
    ): Promise<Blob> => {
        const reader = res.body!.getReader();
        let buffer = new Uint8Array(0);
        let binaryMode = false;
        const binaryChunks: Uint8Array[] = [];

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (binaryMode) { binaryChunks.push(value); continue; }

            const newBuffer = new Uint8Array(buffer.length + value.length);
            newBuffer.set(buffer);
            newBuffer.set(value, buffer.length);
            buffer = newBuffer;

            while (true) {
                const nlIndex = buffer.indexOf(0x0A);
                if (nlIndex === -1) break;
                const lineBytes = buffer.slice(0, nlIndex);
                buffer = buffer.slice(nlIndex + 1);
                const line = new TextDecoder().decode(lineBytes).trim();
                if (!line) continue;
                try {
                    const data = JSON.parse(line);
                    if (data.done) {
                        binaryMode = true;
                        if (buffer.length > 0) binaryChunks.push(buffer);
                        break;
                    }
                    if (data.stage === "error") throw new Error(data.message || "处理失败");
                    onProgress({ stage: data.stage || "encoding", progress: typeof data.progress === "number" ? data.progress : 0 });
                } catch (e) {
                    if (e instanceof SyntaxError) continue;
                    throw e;
                }
            }
        }
        return new Blob(binaryChunks as BlobPart[], { type: "video/mp4" });
    };

    const triggerDownload = (blob: Blob, filename: string) => {
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);
    };

    const syncSrtContent = () => {
        const newSrt = subtitles.map(s => `${s.id}\n${s.start} --> ${s.end}\n${s.text}\n`).join('\n');
        setSrtContent(newSrt);
        return newSrt;
    };

    const shiftAllTimings = (deltaMs: number) => {
        const newSubs = subtitles.map(s => ({
            ...s,
            start: shiftTime(s.start, deltaMs),
            end: shiftTime(s.end, deltaMs),
        }));
        setSubtitles(newSubs);
        const newSrt = newSubs.map(s => `${s.id}\n${s.start} --> ${s.end}\n${s.text}\n`).join('\n');
        setSrtContent(newSrt);
        const label = deltaMs > 0 ? `+${deltaMs}ms` : `${deltaMs}ms`;
        showToast(`已整体平移字幕 ${label}`);
    };

    const handleReplaceAll = () => {
        if (!findText || findMatchCount === 0) return;
        const escaped = findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escaped, 'gi');
        const newSubs = subtitles.map(s => ({ ...s, text: s.text.replace(regex, replaceText) }));
        setSubtitles(newSubs);
        const newSrt = newSubs.map(s => `${s.id}\n${s.start} --> ${s.end}\n${s.text}\n`).join('\n');
        setSrtContent(newSrt);
        showToast(`已替换 ${findMatchCount} 处`);
        setFindText("");
        setReplaceText("");
    };

    const applyTranslations = (texts: string[]) => {
        const newSubs = subtitles.map((s, i) => ({ ...s, text: (texts[i] ?? s.text) }));
        setSubtitles(newSubs);
        const newSrt = newSubs.map(s => `${s.id}\n${s.start} --> ${s.end}\n${s.text}\n`).join('\n');
        setSrtContent(newSrt);
    };

    const handleTranslate = async () => {
        const cfg = getTranslateConfig();
        if (!cfg.enabled || !cfg.apiKey) {
            showToast("请先在右上角「接口设置」中启用并配置翻译", "error");
            return;
        }
        if (isTranslating || subtitles.length === 0) return;

        setIsTranslating(true);
        try {
            const res = await fetch("/api/translate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    lines: subtitles.map(s => s.text),
                    targetLang: cfg.targetLang,
                    apiKey: cfg.apiKey,
                    baseUrl: cfg.baseUrl,
                    model: cfg.model,
                }),
            });

            if (!res.ok) {
                const text = await res.text();
                let message = "翻译失败";
                try {
                    const data = JSON.parse(text);
                    if (data?.error) message = data.error;
                } catch {
                    message = `翻译失败：${res.status}`;
                }
                if (res.status === 401) message = "请先在右上角「接口设置」中配置翻译 API Key";
                throw new Error(message);
            }

            const data = await res.json();
            const translations: string[] = Array.isArray(data?.translations) ? data.translations : [];
            if (!translations.length) throw new Error("翻译结果为空");

            originalSubtitlesRef.current = subtitles;
            applyTranslations(translations);
            setTranslated(true);
            showToast(`已翻译为${cfg.targetLang}`);
        } catch (err) {
            showToast(err instanceof Error ? err.message : "翻译失败", "error");
        } finally {
            setIsTranslating(false);
        }
    };

    const handleRestoreOriginal = () => {
        if (!originalSubtitlesRef.current) return;
        const original = originalSubtitlesRef.current;
        setSubtitles(original);
        const newSrt = original.map(s => `${s.id}\n${s.start} --> ${s.end}\n${s.text}\n`).join('\n');
        setSrtContent(newSrt);
        setTranslated(false);
        originalSubtitlesRef.current = null;
        showToast("已还原原文");
    };

    const handleDownload = async (type: string) => {
        let simInterval: ReturnType<typeof setInterval> | null = null;
        try {
            setDownloading(type);

            const latestSrt = syncSrtContent();

            if (type === "srt") {
                downloadStringAsFile(latestSrt, `subcraft_${jobId}.srt`, "text/plain");
                showToast("SRT 已下载！");
            }
            else if (type === "vtt") {
                const vttContent = convertSrtToVtt(latestSrt);
                downloadStringAsFile(vttContent, `subcraft_${jobId}.vtt`, "text/vtt");
                showToast("VTT 已下载！");
            }
            else if (type === "mp4") {
                setBurnProgress({ stage: "preparing", progress: 0 });

                // Simulated progress — FFmpeg often reports 0% with complex filters,
                // so we show smooth movement to keep users informed something is happening.
                let simulated = 0;
                let hasRealProgress = false;
                simInterval = setInterval(() => {
                    if (hasRealProgress) return;
                    simulated += (85 - simulated) * 0.04;
                    setBurnProgress(prev => prev ? { ...prev, progress: Math.round(simulated) } : prev);
                }, 500);

                const res = await fetch("/api/burn", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ jobId, srtContent: latestSrt, stylePreset, targetHeight: upscaleTarget, aspectRatio: aspectRatio !== "original" ? aspectRatio : undefined, isSample, blobUrl })
                });

                if (!res.ok) {
                    let errorMessage = "视频渲染失败";
                    try {
                        const data = await res.json();
                        if (data.error) errorMessage = data.error;
                    } catch {
                        errorMessage = `服务器错误：${res.status} ${res.statusText}`;
                    }
                    throw new Error(errorMessage);
                }

                const blob = await readBinaryStream(res, (p) => {
                    if (p.progress > 0) {
                        hasRealProgress = true;
                        setBurnProgress({ stage: p.stage, progress: p.progress });
                    } else {
                        setBurnProgress(prev => prev ? { ...prev, stage: p.stage } : prev);
                    }
                });

                clearInterval(simInterval);

                if (blob.size === 0) throw new Error("导出的视频为空");

                triggerDownload(blob, `subcraft_${jobId}_captioned.mp4`);
                showToast("视频已导出！");
                setBurnProgress(null);
            }
            else if (type === "dub") {
                const dc = getDubConfig();
                if (!dc.enabled || !dc.apiKey) {
                    showToast("请先在右上角「接口设置」中启用并配置配音", "error");
                    return;
                }
                if (subtitles.length === 0) {
                    showToast("没有可配音的字幕", "error");
                    return;
                }

                setBurnProgress({ stage: "tts", progress: 0 });

                let simulated = 0;
                let hasRealProgress = false;
                simInterval = setInterval(() => {
                    if (hasRealProgress) return;
                    simulated += (85 - simulated) * 0.04;
                    setBurnProgress(prev => prev ? { ...prev, progress: Math.round(simulated) } : prev);
                }, 500);

                const dubSegments = subtitles
                    .filter(s => s.text.trim())
                    .map(s => ({ start: parseTime(s.start), end: parseTime(s.end), text: s.text.trim() }));

                const res = await fetch("/api/dub", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        jobId,
                        segments: dubSegments,
                        duration: duration > 0 ? duration : undefined,
                        isSample,
                        blobUrl,
                        keepOriginal: dc.keepOriginal,
                        duckDb: dc.duckDb,
                        tts: { baseUrl: dc.baseUrl, apiKey: dc.apiKey, model: dc.model, voice: dc.voice },
                    }),
                });

                if (!res.ok) {
                    let errorMessage = "配音失败";
                    try {
                        const data = await res.json();
                        if (data.error) errorMessage = data.error;
                    } catch {
                        errorMessage = `服务器错误：${res.status} ${res.statusText}`;
                    }
                    throw new Error(errorMessage);
                }

                const blob = await readBinaryStream(res, (p) => {
                    if (p.progress > 0) {
                        hasRealProgress = true;
                        setBurnProgress({ stage: p.stage, progress: p.progress });
                    } else {
                        setBurnProgress(prev => prev ? { ...prev, stage: p.stage } : prev);
                    }
                });

                clearInterval(simInterval);

                if (blob.size === 0) throw new Error("导出的视频为空");

                triggerDownload(blob, `subcraft_${jobId}_dubbed.mp4`);
                showToast("配音视频已导出！");
                setBurnProgress(null);
            }
        } catch (err: unknown) {
            console.error("Export Error:", err);
            showToast((err as Error).message || "发生未知错误", 'error');
        } finally {
            if (simInterval) clearInterval(simInterval);
            setDownloading(null);
            setBurnProgress(null);
        }
    };

    const videoUrl = isSample ? '/sample-demo.mp4' : jobId ? `/api/video?jobId=${jobId}${blobUrl ? `&blobUrl=${encodeURIComponent(blobUrl)}` : ''}` : '';

    // --- Style-dependent subtitle rendering ---
    const renderSubtitleOverlay = () => {
        if (!displayText) return null;

        switch (stylePreset) {
            case "classic":
                return (
                    <div className="absolute bottom-14 left-0 right-0 flex justify-center z-10 px-8 pointer-events-none">
                        <div className="bg-black/80 px-5 py-2 rounded text-center max-w-[90%]">
                            <span className="text-white font-normal text-sm lg:text-base leading-snug tracking-wide" style={{ fontFamily: "Arial, Helvetica, sans-serif" }}>
                                {displayText}
                            </span>
                        </div>
                    </div>
                );

            case "tiktok": {
                const words = displayText.split(/\s+/);
                const highlightIdx = currentSubtitle ? getHighlightedWordIndex(currentSubtitle, currentTime) : 0;
                return (
                    <div className="absolute bottom-1/3 left-0 right-0 flex justify-center z-10 px-6 pointer-events-none">
                        <div className="text-center max-w-[85%] flex flex-wrap justify-center gap-x-2 gap-y-1">
                            {words.map((word, i) => (
                                <span
                                    key={i}
                                    className={cn(
                                        "font-extrabold text-lg lg:text-2xl uppercase leading-tight transition-all duration-150",
                                        i === highlightIdx
                                            ? "text-black bg-[#FACC15] px-1.5 py-0.5 rounded-md"
                                            : "text-white"
                                    )}
                                    style={{
                                        textShadow: i !== highlightIdx ? "0 2px 8px rgba(0,0,0,0.8), 0 0 4px rgba(0,0,0,0.6)" : "none",
                                        letterSpacing: "0.04em",
                                    }}
                                >
                                    {word}
                                </span>
                            ))}
                        </div>
                    </div>
                );
            }

            case "box":
                return (
                    <div className="absolute bottom-14 left-0 right-0 flex justify-center z-10 px-8 pointer-events-none">
                        <div className="bg-white px-5 py-2 text-center shadow-lg max-w-[90%]">
                            <span className="text-black font-semibold text-sm lg:text-base leading-snug tracking-wide">
                                {displayText}
                            </span>
                        </div>
                    </div>
                );

            case "cinematic":
                return (
                    <div className="absolute bottom-14 left-0 right-0 flex justify-center z-10 px-8 pointer-events-none">
                        <div className="text-center max-w-[90%]">
                            <span className="text-white/90 font-light text-sm lg:text-lg tracking-widest italic leading-relaxed" style={{
                                textShadow: "0 2px 12px rgba(0,0,0,0.8), 0 0 30px rgba(0,0,0,0.5)",
                                letterSpacing: "0.1em",
                            }}>
                                {displayText}
                            </span>
                        </div>
                    </div>
                );

            case "outline":
                return (
                    <div className="absolute bottom-14 left-0 right-0 flex justify-center z-10 px-8 pointer-events-none">
                        <div className="text-center max-w-[90%]">
                            <span className="text-white font-bold text-sm lg:text-base leading-snug tracking-wide" style={{
                                WebkitTextStroke: "1.5px black",
                                paintOrder: "stroke fill",
                                textShadow: "0 1px 4px rgba(0,0,0,0.5)",
                            }}>
                                {displayText}
                            </span>
                        </div>
                    </div>
                );

            case "bold-center":
                return (
                    <div className="absolute inset-0 flex items-center justify-center z-10 px-6 pointer-events-none">
                        <div className="text-center max-w-[80%]">
                            <span className="text-white font-black text-xl lg:text-3xl uppercase leading-none tracking-tight" style={{
                                WebkitTextStroke: "2px rgba(0,0,0,0.6)",
                                paintOrder: "stroke fill",
                                textShadow: "0 0 20px rgba(255,255,255,0.15), 0 4px 12px rgba(0,0,0,0.8)",
                            }}>
                                {displayText}
                            </span>
                        </div>
                    </div>
                );

            default:
                return null;
        }
    };

    return (
        <div className="flex-1 flex flex-col md:flex-row h-[calc(100vh-64px)] overflow-hidden">
            {/* Left Panel: Video Player */}
            <motion.div
                variants={panelSlideLeft}
                initial="hidden"
                animate="visible"
                className="md:flex-[3] flex flex-col border-b md:border-b-0 md:border-r bg-card/30 relative"
            >
                <div className="flex-1 p-3 sm:p-6 flex flex-col items-center justify-center relative">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
                        className={cn(
                            "w-full bg-black rounded-lg shadow-xl overflow-hidden relative flex items-center justify-center group ring-1 ring-border",
                            aspectRatio === "9:16" ? "max-w-xs" : aspectRatio === "1:1" ? "max-w-xl" : aspectRatio === "4:5" ? "max-w-md" : "max-w-4xl"
                        )}
                        style={{ aspectRatio: aspectRatio !== "original" ? aspectRatios.find(r => r.id === aspectRatio)?.ratio ?? 16/9 : 16/9 }}
                    >
                        {videoUrl ? (
                            <video
                                ref={videoRef}
                                src={videoUrl}
                                aria-label="视频播放器"
                                className="w-full h-full object-contain"
                                onTimeUpdate={handleTimeUpdate}
                                onPlay={() => setIsPlaying(true)}
                                onPause={() => setIsPlaying(false)}
                                onLoadedMetadata={(e) => { setDuration(e.currentTarget.duration); handleVideoMetadata(e); }}
                                onError={() => setVideoError(true)}
                                onClick={togglePlay}
                            />
                        ) : (
                            <MonitorPlay className="w-24 h-24 text-muted-foreground/30 absolute z-0" />
                        )}

                        {/* Video expired overlay */}
                        {videoError && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white/70 text-center p-6 z-20">
                                <MonitorPlay className="w-16 h-16 mb-3 opacity-40" />
                                <p className="text-sm font-medium">视频会话已过期</p>
                                <p className="text-xs text-white/40 mt-1">字幕数据仍在 —— 可导出为 SRT 或 VTT</p>
                            </div>
                        )}

                        {/* Subtitle Overlay — style-aware */}
                        {renderSubtitleOverlay()}

                        {/* Video Controls overlay on hover */}
                        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-auto">
                            <div className="flex items-center gap-4 text-white">
                                <button onClick={togglePlay} className="hover:text-primary transition-colors">
                                    {isPlaying ? <Pause className="w-6 h-6" fill="currentColor" /> : <Play className="w-6 h-6" fill="currentColor" />}
                                </button>
                                <input
                                    type="range"
                                    min={0}
                                    max={duration || 100}
                                    value={currentTime}
                                    onChange={handleSeek}
                                    className="flex-1 h-1.5 bg-white/30 rounded-full cursor-pointer accent-primary"
                                />
                                <span className="text-xs font-medium tabular-nums text-white/80">
                                    {formatTime(currentTime).slice(3, -4)} / {formatTime(duration).slice(3, -4)}
                                </span>
                            </div>
                        </div>
                    </motion.div>
                </div>

                {/* Style Selection Below Video */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.35 }}
                    className="p-6 border-t bg-card/50"
                >
                    <h3 className="font-medium text-foreground text-sm mb-3">字幕样式</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
                        {stylePresets.map((preset) => (
                            <motion.button
                                key={preset.id}
                                onClick={() => setStylePreset(preset.id)}
                                whileHover={{ y: -2 }}
                                whileTap={{ scale: 0.97 }}
                                transition={{ type: "spring", stiffness: 400, damping: 17 }}
                                className={cn(
                                    "p-3 text-left rounded-xl border transition-all duration-200",
                                    stylePreset === preset.id
                                        ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/30"
                                        : "border-border hover:border-primary/40 hover:bg-muted/30 focus:outline-none"
                                )}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className="font-medium text-xs">{preset.name}</span>
                                    <AnimatePresence>
                                        {stylePreset === preset.id && (
                                            <motion.div
                                                initial={{ scale: 0 }}
                                                animate={{ scale: 1 }}
                                                exit={{ scale: 0 }}
                                                transition={{ type: "spring", stiffness: 500, damping: 20 }}
                                                className="w-2 h-2 rounded-full bg-primary"
                                            />
                                        )}
                                    </AnimatePresence>
                                </div>
                                <span className="text-[10px] text-muted-foreground line-clamp-1">{preset.desc}</span>
                            </motion.button>
                        ))}
                    </div>
                </motion.div>

                {/* Keyboard shortcut hints */}
                <div className="px-6 py-2 text-[10px] text-muted-foreground/40 text-center border-t border-border/20 flex items-center justify-center gap-3">
                    <span><kbd className="bg-muted/50 px-1.5 py-0.5 rounded text-[9px] font-mono">Space</kbd> 播放/暂停</span>
                    <span><kbd className="bg-muted/50 px-1.5 py-0.5 rounded text-[9px] font-mono">J</kbd> -5秒</span>
                    <span><kbd className="bg-muted/50 px-1.5 py-0.5 rounded text-[9px] font-mono">L</kbd> +5秒</span>
                    <span><kbd className="bg-muted/50 px-1 py-0.5 rounded text-[9px] font-mono">&#8593;&#8595;</kbd> 切换</span>
                </div>
            </motion.div>

            {/* Right Panel: Editor */}
            <motion.div
                variants={panelSlideRight}
                initial="hidden"
                animate="visible"
                className="md:flex-[2] flex flex-col bg-background md:min-w-[320px] h-full overflow-hidden"
            >
                {/* Editor Toolbar */}
                <div className="border-b shrink-0 bg-card">
                    <div className="h-14 flex items-center justify-between px-4">
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setShowReviewQueue(!showReviewQueue)}
                                className={cn(
                                    "px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 transition-colors",
                                    showReviewQueue ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-muted/80"
                                )}
                            >
                                <ListTodo className="w-4 h-4" />
                                待审核
                                {needsReviewCount > 0 && (
                                    <span className="bg-destructive text-destructive-foreground text-[10px] px-1.5 py-0.5 rounded-full min-w-4 text-center">
                                        {needsReviewCount}
                                    </span>
                                )}
                            </button>
                            {subtitles.length > 0 && (
                                <span className="text-[11px] text-muted-foreground/60 font-mono tabular-nums ml-1 hidden md:inline">
                                    {subtitles.length} 条 · {totalWords} 词 · {statsMins}分 {String(statsSecs).padStart(2, "0")}秒
                                </span>
                            )}
                        </div>

                        <div className="flex items-center gap-2">
                            {/* AI Translate */}
                            <Tooltip label={translated ? "还原原文" : "AI 翻译字幕"}>
                                <motion.button
                                    onClick={translated ? handleRestoreOriginal : handleTranslate}
                                    disabled={isTranslating}
                                    whileTap={{ scale: 0.95 }}
                                    className={cn(
                                        "px-2.5 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-all disabled:opacity-50",
                                        translated
                                            ? "bg-primary/10 text-primary hover:bg-primary/15"
                                            : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                                    )}
                                >
                                    {isTranslating ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : translated ? (
                                        <Undo2 className="w-4 h-4" />
                                    ) : (
                                        <Languages className="w-4 h-4" />
                                    )}
                                    <span className="hidden sm:inline">{isTranslating ? "翻译中…" : translated ? "还原" : "翻译"}</span>
                                </motion.button>
                            </Tooltip>

                            {/* Copy transcript */}
                            <Tooltip label={copied ? "已复制！" : "复制文稿"}>
                                <motion.button
                                    onClick={handleCopyTranscript}
                                    whileTap={{ scale: 0.95 }}
                                    className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all"
                                >
                                    {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                                </motion.button>
                            </Tooltip>

                            {/* Export Button with Dropdown */}
                            <div className="relative" ref={exportRef}>
                                <motion.button
                                    onClick={() => setIsExportOpen(!isExportOpen)}
                                    whileTap={{ scale: 0.98 }}
                                    className={cn(
                                        "text-sm px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-all relative overflow-hidden",
                                        isExportOpen
                                            ? "bg-foreground text-background shadow-lg"
                                            : "bg-foreground text-background hover:bg-foreground/90"
                                    )}
                                >
                                    {burnProgress && (downloading === "mp4" || downloading === "dub") ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            <span>
                                                {burnProgress.stage === "preparing" ? "准备中…"
                                                    : burnProgress.stage === "tts" ? `配音 ${Math.round(burnProgress.progress)}%`
                                                    : burnProgress.stage === "muxing" ? `合成 ${Math.round(burnProgress.progress)}%`
                                                    : burnProgress.stage === "finalizing" ? "收尾中…"
                                                    : `${Math.round(burnProgress.progress)}%`}
                                            </span>
                                            <motion.div
                                                className="absolute bottom-0 left-0 h-0.5 bg-background/30"
                                                initial={{ width: "0%" }}
                                                animate={{ width: `${burnProgress.stage === "preparing" ? 5 : burnProgress.progress}%` }}
                                                transition={{ duration: 0.3, ease: "easeOut" }}
                                            />
                                        </>
                                    ) : (
                                        <>
                                            <Download className="w-4 h-4" />
                                            导出
                                            <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-200", isExportOpen && "rotate-180")} />
                                        </>
                                    )}
                                </motion.button>

                        <AnimatePresence>
                            {isExportOpen && (
                                <motion.div
                                    initial={{ opacity: 0, y: -4, scale: 0.97 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: -4, scale: 0.97 }}
                                    transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                                    className="absolute right-0 top-full mt-2 w-72 bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden"
                                >
                                    <div className="py-1">
                                        {/* SRT Download */}
                                        <motion.button
                                            onClick={() => handleDownload("srt")}
                                            disabled={downloading !== null}
                                            whileTap={{ scale: 0.97, backgroundColor: "rgba(128,128,128,0.1)" }}
                                            transition={{ duration: 0.1 }}
                                            className="w-full px-4 py-3 flex items-center gap-3 hover:bg-muted/50 transition-colors disabled:opacity-50 text-left"
                                        >
                                            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                                    <rect x="2" y="4" width="20" height="16" rx="3" stroke="url(#srt-grad)" strokeWidth="2" />
                                                    <text x="12" y="14.5" textAnchor="middle" fontSize="8" fontWeight="700" fill="url(#srt-grad)">CC</text>
                                                    <defs>
                                                        <linearGradient id="srt-grad" x1="2" y1="4" x2="22" y2="20" gradientUnits="userSpaceOnUse">
                                                            <stop stopColor="#3B82F6" /><stop offset="1" stopColor="#06B6D4" />
                                                        </linearGradient>
                                                    </defs>
                                                </svg>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-foreground">下载 SRT</p>
                                                <p className="text-[11px] text-muted-foreground">通用格式 —— YouTube、Premiere 等</p>
                                            </div>
                                            {downloading === "srt" && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                                        </motion.button>

                                        {/* VTT Download */}
                                        <motion.button
                                            onClick={() => handleDownload("vtt")}
                                            disabled={downloading !== null}
                                            whileTap={{ scale: 0.97, backgroundColor: "rgba(128,128,128,0.1)" }}
                                            transition={{ duration: 0.1 }}
                                            className="w-full px-4 py-3 flex items-center gap-3 hover:bg-muted/50 transition-colors disabled:opacity-50 text-left"
                                        >
                                            <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0">
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                                    <path d="M4 7l4 5-4 5" stroke="url(#vtt-grad)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                                    <path d="M20 7l-4 5 4 5" stroke="url(#vtt-grad)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                                    <rect x="9" y="10" width="6" height="2" rx="1" fill="url(#vtt-grad)" />
                                                    <rect x="10" y="14" width="4" height="1.5" rx="0.75" fill="url(#vtt-grad)" opacity="0.5" />
                                                    <defs>
                                                        <linearGradient id="vtt-grad" x1="4" y1="7" x2="20" y2="17" gradientUnits="userSpaceOnUse">
                                                            <stop stopColor="#A855F7" /><stop offset="1" stopColor="#EC4899" />
                                                        </linearGradient>
                                                    </defs>
                                                </svg>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-foreground">下载 VTT</p>
                                                <p className="text-[11px] text-muted-foreground">网页格式 —— HTML5 播放器</p>
                                            </div>
                                            {downloading === "vtt" && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                                        </motion.button>

                                        <div className="mx-4 my-1 border-t border-border/50" />

                                        {/* Burned MP4 */}
                                        <motion.button
                                            onClick={() => handleDownload("mp4")}
                                            disabled={downloading !== null}
                                            whileTap={{ scale: 0.97, backgroundColor: "rgba(128,128,128,0.1)" }}
                                            transition={{ duration: 0.1 }}
                                            className="w-full px-4 py-3 flex items-center gap-3 hover:bg-muted/50 transition-colors disabled:opacity-50 text-left"
                                        >
                                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                                    <rect x="2" y="4" width="20" height="16" rx="3" stroke="url(#mp4-grad)" strokeWidth="2" />
                                                    <path d="M10 9l5 3-5 3V9z" fill="url(#mp4-grad)" />
                                                    <rect x="5" y="16" width="14" height="2" rx="1" fill="url(#mp4-grad)" opacity="0.4" />
                                                    <defs>
                                                        <linearGradient id="mp4-grad" x1="2" y1="4" x2="22" y2="20" gradientUnits="userSpaceOnUse">
                                                            <stop stopColor="#FF3B30" /><stop offset="0.5" stopColor="#34C759" /><stop offset="1" stopColor="#00BCD4" />
                                                        </linearGradient>
                                                    </defs>
                                                </svg>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-foreground">导出压制字幕的 MP4</p>
                                                {burnProgress && downloading === "mp4" ? (
                                                    <div className="mt-1 space-y-1">
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                                                                {burnProgress.stage === "preparing" && (
                                                                    <><Loader2 className="w-3 h-3 animate-spin" />准备中...</>
                                                                )}
                                                                {burnProgress.stage === "encoding" && (
                                                                    <>{burnProgress.progress < 1 && <Loader2 className="w-3 h-3 animate-spin" />}正在编码... {Math.round(burnProgress.progress)}%</>
                                                                )}
                                                                {burnProgress.stage === "finalizing" && (
                                                                    <><Loader2 className="w-3 h-3 animate-spin" />收尾中...</>
                                                                )}
                                                            </span>
                                                        </div>
                                                        <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                                                            {burnProgress.stage === "preparing" ? (
                                                                <div className="h-full w-1/3 bg-primary/50 rounded-full animate-pulse" />
                                                            ) : (
                                                                <motion.div
                                                                    className="h-full bg-primary rounded-full"
                                                                    initial={{ width: "0%" }}
                                                                    animate={{ width: `${burnProgress.progress}%` }}
                                                                    transition={{ duration: 0.3, ease: "easeOut" }}
                                                                />
                                                            )}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <p className="text-[11px] text-muted-foreground">已把字幕压制进视频 —— 适合社交媒体</p>
                                                )}
                                            </div>
                                            {downloading === "mp4" && !burnProgress && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                                        </motion.button>

                                        {/* AI Dub */}
                                        <motion.button
                                            onClick={() => handleDownload("dub")}
                                            disabled={downloading !== null}
                                            whileTap={{ scale: 0.97, backgroundColor: "rgba(128,128,128,0.1)" }}
                                            transition={{ duration: 0.1 }}
                                            className="w-full px-4 py-3 flex items-center gap-3 hover:bg-muted/50 transition-colors disabled:opacity-50 text-left"
                                        >
                                            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                                                <AudioLines className="w-4 h-4 text-emerald-500" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-foreground">AI 配音 MP4</p>
                                                {burnProgress && downloading === "dub" ? (
                                                    <div className="mt-1 space-y-1">
                                                        <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                                                            {burnProgress.stage === "tts" && (<><Loader2 className="w-3 h-3 animate-spin" />合成配音... {Math.round(burnProgress.progress)}%</>)}
                                                            {burnProgress.stage === "muxing" && (<><Loader2 className="w-3 h-3 animate-spin" />混入视频... {Math.round(burnProgress.progress)}%</>)}
                                                            {burnProgress.stage === "finalizing" && (<><Loader2 className="w-3 h-3 animate-spin" />收尾中...</>)}
                                                        </span>
                                                        <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                                                            <motion.div
                                                                className="h-full bg-emerald-500 rounded-full"
                                                                initial={{ width: "0%" }}
                                                                animate={{ width: `${burnProgress.progress}%` }}
                                                                transition={{ duration: 0.3, ease: "easeOut" }}
                                                            />
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <p className="text-[11px] text-muted-foreground">生成目标语言配音并混入视频</p>
                                                )}
                                            </div>
                                            {downloading === "dub" && !burnProgress && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                                        </motion.button>

                                        {/* Aspect Ratio selector */}
                                        <div className="mx-4 my-1 border-t border-border/50" />
                                        <div className="px-4 py-3">
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="text-xs font-semibold text-foreground">画面比例</span>
                                            </div>
                                            <div className="flex gap-1.5">
                                                {aspectRatios.map((opt) => (
                                                    <button
                                                        key={opt.id}
                                                        onClick={() => setAspectRatio(opt.id)}
                                                        className={cn(
                                                            "flex-1 text-[11px] font-medium py-1.5 rounded-md border transition-all",
                                                            aspectRatio === opt.id
                                                                ? "border-primary bg-primary/10 text-primary"
                                                                : "border-border text-muted-foreground hover:border-primary/40"
                                                        )}
                                                    >
                                                        {opt.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                            </div>
                        </div>
                    </div>

                    {/* Search bar + Find & Replace */}
                    {subtitles.length > 0 && (
                        <div className="px-4 py-2 border-t border-border/40">
                            <div className="flex items-center gap-2">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
                                    <input
                                        type="text"
                                        placeholder="搜索字幕..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full pl-8 pr-3 py-1.5 text-sm bg-muted/30 border border-border/50 rounded-lg outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40 transition-all text-foreground placeholder:text-muted-foreground/40"
                                    />
                                </div>
                                <Tooltip label="查找与替换">
                                    <button
                                        onClick={() => setShowFindReplace(!showFindReplace)}
                                        className={cn(
                                            "p-1.5 rounded-md transition-colors shrink-0",
                                            showFindReplace ? "bg-primary/10 text-primary" : "text-muted-foreground/50 hover:text-foreground hover:bg-muted/50"
                                        )}
                                    >
                                        <ArrowLeftRight className="w-3.5 h-3.5" />
                                    </button>
                                </Tooltip>
                            </div>

                            <AnimatePresence>
                                {showFindReplace && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: "auto", opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                                        className="overflow-hidden"
                                    >
                                        <div className="pt-2 space-y-2">
                                            <input
                                                type="text"
                                                placeholder="查找..."
                                                value={findText}
                                                onChange={(e) => setFindText(e.target.value)}
                                                className="w-full px-3 py-1.5 text-sm bg-muted/30 border border-border/50 rounded-lg outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40 transition-all text-foreground placeholder:text-muted-foreground/40"
                                            />
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="text"
                                                    placeholder="替换为..."
                                                    value={replaceText}
                                                    onChange={(e) => setReplaceText(e.target.value)}
                                                    className="flex-1 px-3 py-1.5 text-sm bg-muted/30 border border-border/50 rounded-lg outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40 transition-all text-foreground placeholder:text-muted-foreground/40"
                                                />
                                                <button
                                                    onClick={handleReplaceAll}
                                                    disabled={findMatchCount === 0}
                                                    className="text-xs font-medium px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                                                >
                                                    全部替换
                                                </button>
                                            </div>
                                            {findText && (
                                                <span className="text-[10px] text-muted-foreground/60">
                                                    找到 {findMatchCount} 处匹配
                                                </span>
                                            )}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    )}

                    {/* Timing offset */}
                    {subtitles.length > 0 && (
                        <div className="px-4 py-2 border-t border-border/30">
                            <div className="flex items-center gap-2">
                                <Clock className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                                <span className="text-[10px] text-muted-foreground/50 shrink-0">偏移</span>
                                <div className="flex gap-1 flex-1 justify-end">
                                    {[
                                        { label: "-1s", value: -1000 },
                                        { label: "-0.5s", value: -500 },
                                        { label: "-0.1s", value: -100 },
                                        { label: "+0.1s", value: 100 },
                                        { label: "+0.5s", value: 500 },
                                        { label: "+1s", value: 1000 },
                                    ].map((opt) => (
                                        <motion.button
                                            key={opt.label}
                                            onClick={() => shiftAllTimings(opt.value)}
                                            whileTap={{ scale: 0.95 }}
                                            className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-border/50 text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-muted/30 transition-all"
                                        >
                                            {opt.label}
                                        </motion.button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Subtitle List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                    {filteredSubtitles.map((sub, index) => {
                        const isLong = sub.text.length > 50;
                        const needsReview = sub.confidence < 0.8;

                        return (
                            <motion.div
                                id={`sub-${sub.id}`}
                                key={sub.id}
                                variants={subtitleCardVariant}
                                initial="hidden"
                                animate="visible"
                                transition={{ delay: Math.min(index * 0.03, 0.6) }}
                                onClick={() => {
                                    setActiveId(sub.id);
                                    if (videoRef.current) videoRef.current.currentTime = parseTime(sub.start);
                                }}
                                className={cn(
                                    "p-4 rounded-xl border transition-all duration-200 cursor-text group",
                                    activeId === sub.id
                                        ? "border-primary bg-primary/5 ring-1 ring-primary/20 shadow-sm"
                                        : nearestId === sub.id
                                            ? "border-dashed border-primary/40 bg-primary/[0.02]"
                                            : "border-border hover:border-border/80 bg-card"
                                )}
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground mr-1">
                                            {sub.id}
                                        </span>
                                        <span className="text-xs text-muted-foreground font-mono tabular-nums">
                                            {sub.start.slice(3, -4)} - {sub.end.slice(3, -4)}
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        {needsReview && (
                                            <span className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-orange-400 bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 rounded-full">
                                                <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
                                                待审核
                                            </span>
                                        )}
                                        {isLong && (
                                            <span className="text-[10px] uppercase font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded" title="过长字幕">
                                                过长
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <textarea
                                    className={cn(
                                        "w-full bg-transparent resize-none outline-none leading-relaxed transition-colors duration-200",
                                        activeId === sub.id ? "text-foreground" : nearestId === sub.id ? "text-foreground/60" : "text-muted-foreground group-hover:text-foreground/80"
                                    )}
                                    rows={2}
                                    value={sub.text}
                                    onChange={(e) => {
                                        const newSubs = subtitles.map(s =>
                                            s.id === sub.id ? { ...s, text: e.target.value } : s
                                        );
                                        setSubtitles(newSubs);
                                    }}
                                />
                            </motion.div>
                        );
                    })}

                    {filteredSubtitles.length === 0 && searchQuery && (
                        <div className="text-center py-12 text-muted-foreground/50">
                            <Search className="w-8 h-8 mx-auto mb-3 opacity-40" />
                            <p className="text-sm font-medium">没有匹配 &ldquo;{searchQuery}&rdquo; 的字幕</p>
                        </div>
                    )}
                </div>
            </motion.div>

            {/* Toast notifications */}
            <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 pointer-events-none">
                <AnimatePresence>
                    {toasts.map(toast => (
                        <motion.div
                            key={toast.id}
                            initial={{ opacity: 0, y: 16, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 8, scale: 0.95 }}
                            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                            className={cn(
                                "pointer-events-auto flex items-center gap-2.5 px-4 py-2.5 rounded-xl border shadow-lg backdrop-blur-sm text-sm font-medium",
                                toast.type === 'success'
                                    ? "bg-card/90 border-green-500/20 text-green-500"
                                    : "bg-card/90 border-destructive/20 text-destructive"
                            )}
                        >
                            {toast.type === 'success'
                                ? <CheckCircle2 className="w-4 h-4 shrink-0" />
                                : <AlertTriangle className="w-4 h-4 shrink-0" />
                            }
                            <span className="truncate max-w-xs">{toast.message}</span>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </div>
    );
}
