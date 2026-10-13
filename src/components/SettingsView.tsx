"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { KeyRound, ArrowLeft, CheckCircle2, Server, Cpu, Cloud, Languages, AudioLines, Volume2, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    getSttSettings,
    saveSttSettings,
    getTranslateConfig,
    saveTranslateConfig,
    getDubConfig,
    saveDubConfig,
    DEFAULT_BASE_URL,
    DEFAULT_MODEL,
    DEFAULT_LOCAL_BASE_URL,
    DEFAULT_LOCAL_MODEL,
    DEFAULT_TRANSLATE_BASE_URL,
    DEFAULT_TRANSLATE_MODEL,
    DEFAULT_TRANSLATE_TARGET,
    DEFAULT_DUB_BASE_URL,
    DEFAULT_DUB_MODEL,
    DEFAULT_DUB_VOICE,
    DEFAULT_DUB_DUCK_DB,
    TARGET_LANGS,
    DUB_VOICES,
    type SttMode,
} from "@/lib/api-config";

const inputCls =
    "w-full px-3 py-2 bg-muted/50 border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all duration-300 text-sm font-mono";

const SECTIONS = [
    { id: "stt", label: "语音识别", Icon: Cpu },
    { id: "translate", label: "字幕翻译", Icon: Languages },
    { id: "dub", label: "AI 配音", Icon: AudioLines },
] as const;

const labelCls = "text-xs font-medium text-muted-foreground flex items-center gap-1.5";
const sectionTitle = "text-base font-semibold text-foreground flex items-center gap-2";

export default function SettingsView({
    isOpen,
    onClose,
    variant = "default",
}: {
    isOpen: boolean;
    onClose: () => void;
    variant?: "default" | "out-of-credits";
}) {
    const [mode, setMode] = useState<SttMode>("local");
    const [localBaseUrl, setLocalBaseUrl] = useState(DEFAULT_LOCAL_BASE_URL);
    const [localModel, setLocalModel] = useState(DEFAULT_LOCAL_MODEL);
    const [remoteBaseUrl, setRemoteBaseUrl] = useState("");
    const [remoteApiKey, setRemoteApiKey] = useState("");
    const [remoteModel, setRemoteModel] = useState("");

    const [tEnabled, setTEnabled] = useState(true);
    const [tBaseUrl, setTBaseUrl] = useState("");
    const [tApiKey, setTApiKey] = useState("");
    const [tModel, setTModel] = useState("");
    const [tTarget, setTTarget] = useState("中文");

    const [dEnabled, setDEnabled] = useState(false);
    const [dBaseUrl, setDBaseUrl] = useState("");
    const [dApiKey, setDApiKey] = useState("");
    const [dModel, setDModel] = useState("");
    const [dVoice, setDVoice] = useState("");
    const [dKeepOriginal, setDKeepOriginal] = useState(true);
    const [dDuckDb, setDDuckDb] = useState(DEFAULT_DUB_DUCK_DB);

    const [saved, setSaved] = useState(false);
    const [activeSection, setActiveSection] = useState<string>("stt");

    const scrollRef = useRef<HTMLDivElement>(null);
    const flashTimer = useRef<number | null>(null);

    useEffect(() => {
        if (isOpen) {
            const s = getSttSettings();
            setMode(s.mode);
            setLocalBaseUrl(s.localBaseUrl);
            setLocalModel(s.localModel);
            setRemoteBaseUrl(s.remoteBaseUrl);
            setRemoteApiKey(s.remoteApiKey);
            setRemoteModel(s.remoteModel);

            const t = getTranslateConfig();
            setTEnabled(t.enabled);
            setTBaseUrl(t.baseUrl);
            setTApiKey(t.apiKey);
            setTModel(t.model);
            setTTarget(t.targetLang);

            const d = getDubConfig();
            setDEnabled(d.enabled);
            setDBaseUrl(d.baseUrl);
            setDApiKey(d.apiKey);
            setDModel(d.model);
            setDVoice(d.voice);
            setDKeepOriginal(d.keepOriginal);
            setDDuckDb(d.duckDb);
            setSaved(false);
        }
    }, [isOpen]);

    // Escape closes the page
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [isOpen, onClose]);

    // Clear the pending highlight timer on unmount
    useEffect(() => () => {
        if (flashTimer.current) window.clearTimeout(flashTimer.current);
    }, []);

    // Scroll-spy for the section nav
    useEffect(() => {
        if (!isOpen) return;
        const root = scrollRef.current;
        if (!root) return;
        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries
                    .filter((e) => e.isIntersecting)
                    .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
                if (visible[0]) {
                    const id = visible[0].target.getAttribute("data-section");
                    if (id) setActiveSection(id);
                }
            },
            { root, rootMargin: "-8% 0px -75% 0px", threshold: 0 }
        );
        SECTIONS.forEach((s) => {
            const el = document.getElementById(`settings-${s.id}`);
            if (el) observer.observe(el);
        });
        return () => observer.disconnect();
    }, [isOpen]);

    const handleSave = () => {
        saveSttSettings({ mode, localBaseUrl, localModel, remoteBaseUrl, remoteApiKey, remoteModel });
        saveTranslateConfig({ enabled: tEnabled, baseUrl: tBaseUrl, apiKey: tApiKey, model: tModel, targetLang: tTarget });
        saveDubConfig({
            enabled: dEnabled,
            baseUrl: dBaseUrl,
            apiKey: dApiKey,
            model: dModel,
            voice: dVoice,
            keepOriginal: dKeepOriginal,
            duckDb: dDuckDb,
        });
        setSaved(true);
        if (variant === "out-of-credits") {
            // Blocking prompt — resume the pipeline once the key is in place.
            setTimeout(() => onClose(), 700);
        } else {
            setTimeout(() => setSaved(false), 2000);
        }
    };

    const scrollTo = (id: string) => {
        const el = document.getElementById(`settings-${id}`);
        el?.scrollIntoView({ behavior: "smooth", block: "start" });
        setActiveSection(id);

        // Flash the section so the click gives feedback even when the panel
        // is short enough that there is nothing to scroll. Toggling the class
        // via the DOM (with a forced reflow) reliably restarts the animation.
        if (el) {
            if (flashTimer.current) window.clearTimeout(flashTimer.current);
            el.classList.remove("settings-flash");
            void el.offsetWidth;
            el.classList.add("settings-flash");
            flashTimer.current = window.setTimeout(() => el.classList.remove("settings-flash"), 1100);
        }
    };

    const sectionCls = "scroll-mt-4 bg-card border border-border rounded-2xl p-5 sm:p-6 space-y-4";

    const savedKeyCls = "items-center gap-1.5 text-sm font-medium px-3.5 py-2 rounded-lg transition-all disabled:opacity-50";

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                    role="dialog"
                    aria-modal="true"
                    aria-label="接口设置"
                    className="fixed inset-0 z-50 bg-background text-foreground flex flex-col"
                >
                    {/* Header */}
                    <header className="h-14 border-b border-border/60 flex items-center gap-3 px-4 sm:px-6 shrink-0 bg-card/80 backdrop-blur-xl">
                        <button
                            onClick={onClose}
                            aria-label="返回"
                            className="p-2 -ml-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all duration-200"
                        >
                            <ArrowLeft className="w-[18px] h-[18px]" />
                        </button>
                        <div
                            className={cn(
                                "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                                variant === "out-of-credits" ? "bg-amber-500/10 text-amber-500" : "bg-primary/10 text-primary"
                            )}
                        >
                            <KeyRound className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-sm font-semibold tracking-tight truncate">
                                {variant === "out-of-credits" ? "请先配置接口" : "接口设置"}
                            </h2>
                            <p className="text-[11px] text-muted-foreground truncate">
                                语音识别可选本地 Whisper 或在线接口；翻译、配音为可选功能。
                            </p>
                        </div>
                        <motion.button
                            onClick={handleSave}
                            disabled={saved && variant !== "out-of-credits"}
                            whileTap={{ scale: 0.98 }}
                            className={cn(savedKeyCls, "ml-auto inline-flex", saved ? "bg-green-500/10 text-green-500" : "bg-foreground text-background hover:opacity-90")}
                        >
                            {saved ? (
                                <>
                                    <CheckCircle2 className="w-4 h-4" />
                                    已保存
                                </>
                            ) : (
                                <>
                                    <Save className="w-4 h-4" />
                                    保存
                                </>
                            )}
                        </motion.button>
                    </header>

                    {/* Body */}
                    <div className="flex-1 overflow-hidden">
                        <div className="max-w-5xl mx-auto h-full flex">
                            {/* Section nav */}
                            <nav className="hidden md:flex flex-col gap-1 p-4 w-[190px] shrink-0 border-r border-border/60">
                                {SECTIONS.map(({ id, label, Icon }) => (
                                    <button
                                        key={id}
                                        onClick={() => scrollTo(id)}
                                        className={cn(
                                            "flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors",
                                            activeSection === id
                                                ? "bg-muted text-foreground font-medium"
                                                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                                        )}
                                    >
                                        <Icon className="w-4 h-4" />
                                        {label}
                                    </button>
                                ))}
                            </nav>

                            {/* Sections */}
                            <div ref={scrollRef} className="flex-1 min-w-0 overflow-y-auto custom-scrollbar p-4 sm:p-6 space-y-5">
                                {/* ── 语音识别 ── */}
                                <section id="settings-stt" data-section="stt" className={sectionCls}>
                                    <div>
                                        <h3 className={sectionTitle}>
                                            <Cpu className="w-4 h-4" />
                                            语音识别（STT）
                                        </h3>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            转写视频音频为带时间轴的字幕。本地模式无需 Key、音频不出本机。
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 p-1 bg-muted/40 rounded-lg">
                                        {([
                                            { id: "local" as SttMode, label: "本地 Whisper", icon: Cpu, hint: "无需 Key，离线" },
                                            { id: "remote" as SttMode, label: "在线接口", icon: Cloud, hint: "需 API Key" },
                                        ]).map(({ id, label, icon: Icon, hint }) => (
                                            <button
                                                key={id}
                                                type="button"
                                                onClick={() => { setMode(id); setSaved(false); }}
                                                className={`flex flex-col items-center gap-0.5 py-2 rounded-md text-sm font-medium transition-all ${
                                                    mode === id
                                                        ? "bg-card text-foreground shadow-sm border border-border"
                                                        : "text-muted-foreground hover:text-foreground"
                                                }`}
                                            >
                                                <span className="flex items-center gap-1.5">
                                                    <Icon className="w-3.5 h-3.5" />
                                                    {label}
                                                </span>
                                                <span className="text-[10px] font-normal opacity-70">{hint}</span>
                                            </button>
                                        ))}
                                    </div>

                                    {mode === "local" ? (
                                        <div className="space-y-4">
                                            <div className="grid sm:grid-cols-2 gap-4">
                                                <div className="space-y-1.5">
                                                    <label className={labelCls}>
                                                        <Server className="w-3.5 h-3.5" />
                                                        本地服务地址
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={localBaseUrl}
                                                        onChange={(e) => { setLocalBaseUrl(e.target.value); setSaved(false); }}
                                                        placeholder={DEFAULT_LOCAL_BASE_URL}
                                                        className={inputCls}
                                                    />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className={labelCls}>
                                                        <Cpu className="w-3.5 h-3.5" />
                                                        模型名称
                                                    </label>
                                                    <input
                                                        type="text"
                                                        list="local-model-list"
                                                        value={localModel}
                                                        onChange={(e) => { setLocalModel(e.target.value); setSaved(false); }}
                                                        placeholder={DEFAULT_LOCAL_MODEL}
                                                        className={inputCls}
                                                    />
                                                    <datalist id="local-model-list">
                                                        <option value="tiny" />
                                                        <option value="base" />
                                                        <option value="small" />
                                                        <option value="medium" />
                                                        <option value="large-v3" />
                                                    </datalist>
                                                </div>
                                            </div>
                                            <div className="bg-muted/40 border border-border rounded-lg px-3 py-2">
                                                <p className="text-[11px] text-muted-foreground leading-relaxed">
                                                    本地模式无需 API Key。请先启动 <span className="font-mono text-foreground/80">local-stt/</span> 服务
                                                    （默认 <span className="font-mono text-foreground/80">http://localhost:8000</span>），见项目 README。
                                                </p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            <div className="space-y-1.5">
                                                <label className={labelCls}>
                                                    <Server className="w-3.5 h-3.5" />
                                                    接口地址（Base URL）
                                                </label>
                                                <input
                                                    type="text"
                                                    value={remoteBaseUrl}
                                                    onChange={(e) => { setRemoteBaseUrl(e.target.value); setSaved(false); }}
                                                    placeholder={DEFAULT_BASE_URL}
                                                    className={inputCls}
                                                />
                                            </div>
                                            <div className="grid sm:grid-cols-2 gap-4">
                                                <div className="space-y-1.5">
                                                    <label className={labelCls}>
                                                        <KeyRound className="w-3.5 h-3.5" />
                                                        API Key
                                                    </label>
                                                    <input
                                                        type="password"
                                                        value={remoteApiKey}
                                                        onChange={(e) => { setRemoteApiKey(e.target.value); setSaved(false); }}
                                                        placeholder="sk-..."
                                                        className={inputCls}
                                                    />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className={labelCls}>
                                                        <Cpu className="w-3.5 h-3.5" />
                                                        模型名称
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={remoteModel}
                                                        onChange={(e) => { setRemoteModel(e.target.value); setSaved(false); }}
                                                        placeholder={DEFAULT_MODEL}
                                                        className={inputCls}
                                                    />
                                                </div>
                                            </div>
                                            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                                                <p className="text-[11px] text-amber-600 dark:text-amber-400 leading-relaxed">
                                                    需支持「词级时间戳」。推荐 Together AI、OpenAI（whisper-1）、Groq、Fireworks，或自建 whisper/vLLM。
                                                    只返回纯文本的接口，时间轴会采用估算，准确度较低。
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </section>

                                {/* ── 字幕翻译 ── */}
                                <section id="settings-translate" data-section="translate" className={sectionCls}>
                                    <label className="flex items-start justify-between gap-4 cursor-pointer">
                                        <div>
                                            <h3 className={sectionTitle}>
                                                <Languages className="w-4 h-4" />
                                                字幕翻译（可选）
                                            </h3>
                                            <p className="text-xs text-muted-foreground mt-1">
                                                调用兼容 OpenAI /chat/completions 的接口，把字幕翻译成目标语言。
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            role="switch"
                                            aria-checked={tEnabled}
                                            onClick={() => { setTEnabled(v => !v); setSaved(false); }}
                                            className={`relative h-6 w-11 shrink-0 mt-0.5 rounded-full transition-colors ${tEnabled ? "bg-primary" : "bg-muted"}`}
                                        >
                                            <span
                                                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-background shadow transition-transform ${tEnabled ? "translate-x-5" : "translate-x-0"}`}
                                            />
                                        </button>
                                    </label>

                                    {tEnabled && (
                                        <div className="space-y-4">
                                            <div className="space-y-1.5">
                                                <label className={labelCls}>
                                                    <Server className="w-3.5 h-3.5" />
                                                    接口地址（Base URL）
                                                </label>
                                                <input
                                                    type="text"
                                                    value={tBaseUrl}
                                                    onChange={(e) => { setTBaseUrl(e.target.value); setSaved(false); }}
                                                    placeholder={DEFAULT_TRANSLATE_BASE_URL}
                                                    className={inputCls}
                                                />
                                            </div>
                                            <div className="grid sm:grid-cols-2 gap-4">
                                                <div className="space-y-1.5">
                                                    <label className={labelCls}>
                                                        <KeyRound className="w-3.5 h-3.5" />
                                                        API Key
                                                    </label>
                                                    <input
                                                        type="password"
                                                        value={tApiKey}
                                                        onChange={(e) => { setTApiKey(e.target.value); setSaved(false); }}
                                                        placeholder="sk-..."
                                                        className={inputCls}
                                                    />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className={labelCls}>模型名称</label>
                                                    <input
                                                        type="text"
                                                        value={tModel}
                                                        onChange={(e) => { setTModel(e.target.value); setSaved(false); }}
                                                        placeholder={DEFAULT_TRANSLATE_MODEL}
                                                        className={inputCls}
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className={labelCls}>目标语言</label>
                                                <input
                                                    type="text"
                                                    list="translate-target-langs"
                                                    value={tTarget}
                                                    onChange={(e) => { setTTarget(e.target.value); setSaved(false); }}
                                                    placeholder={DEFAULT_TRANSLATE_TARGET}
                                                    className={inputCls}
                                                />
                                                <datalist id="translate-target-langs">
                                                    {TARGET_LANGS.map(l => <option key={l} value={l} />)}
                                                </datalist>
                                            </div>
                                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                                                使用任意兼容 OpenAI /chat/completions 的接口（如 SiliconFlow、DeepSeek）。
                                                目标语言可从下拉中选择，也可直接输入任意语言（如「繁體中文」「Italiano」）。
                                                识别完成后可在编辑器里一键翻译字幕。
                                            </p>
                                        </div>
                                    )}
                                </section>

                                {/* ── AI 配音 ── */}
                                <section id="settings-dub" data-section="dub" className={sectionCls}>
                                    <label className="flex items-start justify-between gap-4 cursor-pointer">
                                        <div>
                                            <h3 className={sectionTitle}>
                                                <AudioLines className="w-4 h-4" />
                                                配音（可选）
                                            </h3>
                                            <p className="text-xs text-muted-foreground mt-1">
                                                用 TTS 把字幕合成为目标语言语音并按时间轴混入视频。
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            role="switch"
                                            aria-checked={dEnabled}
                                            onClick={() => { setDEnabled(v => !v); setSaved(false); }}
                                            className={`relative h-6 w-11 shrink-0 mt-0.5 rounded-full transition-colors ${dEnabled ? "bg-primary" : "bg-muted"}`}
                                        >
                                            <span
                                                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-background shadow transition-transform ${dEnabled ? "translate-x-5" : "translate-x-0"}`}
                                            />
                                        </button>
                                    </label>

                                    {dEnabled && (
                                        <div className="space-y-4">
                                            <div className="space-y-1.5">
                                                <label className={labelCls}>
                                                    <Server className="w-3.5 h-3.5" />
                                                    接口地址（Base URL）
                                                </label>
                                                <input
                                                    type="text"
                                                    value={dBaseUrl}
                                                    onChange={(e) => { setDBaseUrl(e.target.value); setSaved(false); }}
                                                    placeholder={DEFAULT_DUB_BASE_URL}
                                                    className={inputCls}
                                                />
                                            </div>
                                            <div className="grid sm:grid-cols-2 gap-4">
                                                <div className="space-y-1.5">
                                                    <label className={labelCls}>
                                                        <KeyRound className="w-3.5 h-3.5" />
                                                        API Key
                                                    </label>
                                                    <input
                                                        type="password"
                                                        value={dApiKey}
                                                        onChange={(e) => { setDApiKey(e.target.value); setSaved(false); }}
                                                        placeholder="sk-..."
                                                        className={inputCls}
                                                    />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className={labelCls}>模型名称</label>
                                                    <input
                                                        type="text"
                                                        value={dModel}
                                                        onChange={(e) => { setDModel(e.target.value); setSaved(false); }}
                                                        placeholder={DEFAULT_DUB_MODEL}
                                                        className={inputCls}
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className={labelCls}>音色</label>
                                                <input
                                                    type="text"
                                                    list="dub-voice-list"
                                                    value={dVoice}
                                                    onChange={(e) => { setDVoice(e.target.value); setSaved(false); }}
                                                    placeholder={DEFAULT_DUB_VOICE}
                                                    className={inputCls}
                                                />
                                                <datalist id="dub-voice-list">
                                                    {DUB_VOICES.map(v => <option key={v} value={v} />)}
                                                </datalist>
                                            </div>

                                            <label className="flex items-center justify-between cursor-pointer pt-1">
                                                <span className={labelCls}>
                                                    <Volume2 className="w-3.5 h-3.5" />
                                                    保留原声（压低混入）
                                                </span>
                                                <button
                                                    type="button"
                                                    role="switch"
                                                    aria-checked={dKeepOriginal}
                                                    onClick={() => { setDKeepOriginal(v => !v); setSaved(false); }}
                                                    className={`relative h-6 w-11 rounded-full transition-colors ${dKeepOriginal ? "bg-primary" : "bg-muted"}`}
                                                >
                                                    <span
                                                        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-background shadow transition-transform ${dKeepOriginal ? "translate-x-5" : "translate-x-0"}`}
                                                    />
                                                </button>
                                            </label>

                                            {dKeepOriginal && (
                                                <div className="space-y-1.5">
                                                    <div className="flex items-center justify-between">
                                                        <label className={labelCls}>原声降低音量</label>
                                                        <span className="text-xs font-mono text-muted-foreground">
                                                            -{Math.round(dDuckDb)} dB
                                                        </span>
                                                    </div>
                                                    <input
                                                        type="range"
                                                        min={0}
                                                        max={30}
                                                        step={1}
                                                        value={dDuckDb}
                                                        onChange={(e) => { setDDuckDb(Number(e.target.value)); setSaved(false); }}
                                                        className="w-full accent-primary"
                                                    />
                                                </div>
                                            )}

                                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                                                使用任意兼容 OpenAI /audio/speech 的接口（如 SiliconFlow、OpenAI）。
                                                翻译完成后在编辑器「导出」中选择「AI 配音 MP4」，即可生成目标语言配音并混入视频。
                                                关闭「保留原声」则完全替换原音轨。
                                            </p>
                                        </div>
                                    )}
                                </section>
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
