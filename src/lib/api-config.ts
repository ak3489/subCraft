/**
 * 供应商配置管理。
 *
 * 语音识别（STT）支持两种模式：
 *   - local ：本地 faster-whisper 服务（见 local-stt/），无需 API Key
 *   - remote：任意兼容 OpenAI /audio/transcriptions 的在线接口
 *
 * 字幕翻译为可选的在线功能：调用任意兼容 OpenAI /chat/completions 的接口。
 * 所有配置只保存在浏览器 localStorage，请求时随接口一起发送。
 */

const KEYS = {
    // STT 模式
    mode: "substudio_stt_mode",
    // 本地 STT
    localBaseUrl: "substudio_local_base_url",
    localModel: "substudio_local_model",
    // 在线 STT
    remoteBaseUrl: "substudio_api_base_url",
    remoteApiKey: "substudio_together_api_key",
    remoteModel: "substudio_api_model",
    // 翻译（在线）
    translateEnabled: "substudio_translate_enabled",
    translateBaseUrl: "substudio_translate_base_url",
    translateApiKey: "substudio_translate_api_key",
    translateModel: "substudio_translate_model",
    translateTarget: "substudio_translate_target",
    // 配音（在线 TTS）
    dubEnabled: "substudio_dub_enabled",
    dubBaseUrl: "substudio_dub_base_url",
    dubApiKey: "substudio_dub_api_key",
    dubModel: "substudio_dub_model",
    dubVoice: "substudio_dub_voice",
    dubKeepOriginal: "substudio_dub_keep_original",
    dubDuckDb: "substudio_dub_duck_db",
} as const;

export type SttMode = "local" | "remote";

/** 本地 Whisper 服务默认地址（local-stt/ 的默认端口） */
export const DEFAULT_LOCAL_BASE_URL = "http://localhost:8000/v1";
export const DEFAULT_LOCAL_MODEL = "large-v3";

/** 在线 STT 默认值 */
export const DEFAULT_BASE_URL = "https://api.together.xyz/v1";
export const DEFAULT_MODEL = "openai/whisper-large-v3";

/** 翻译默认值（在线，OpenAI 兼容 chat/completions） */
export const DEFAULT_TRANSLATE_BASE_URL = "https://api.siliconflow.cn/v1";
export const DEFAULT_TRANSLATE_MODEL = "Qwen/Qwen2.5-7B-Instruct";
export const DEFAULT_TRANSLATE_TARGET = "中文";

/** 可选的目标语言 */
export const TARGET_LANGS = ["中文", "English", "日本語", "한국어", "Français", "Deutsch", "Español", "Русский"];

/** 配音（TTS）默认值（在线，OpenAI 兼容 /audio/speech） */
export const DEFAULT_DUB_BASE_URL = "https://api.siliconflow.cn/v1";
export const DEFAULT_DUB_MODEL = "FunAudioLLM/CosyVoice2-0.5B";
export const DEFAULT_DUB_VOICE = "alex";
/** 保留原声时，原声默认降低的音量（单位 dB） */
export const DEFAULT_DUB_DUCK_DB = 18;

/** 可选的 TTS 音色（不同供应商支持的音色不同，仅作下拉建议） */
export const DUB_VOICES = [
    "alloy", "echo", "fable", "onyx", "nova", "shimmer",
    "alex", "anna", "bella", "benjamin", "charles", "claire", "david", "diana",
];

/** 设置面板中可编辑的 STT 原始字段 */
export interface SttSettings {
    mode: SttMode;
    localBaseUrl: string;
    localModel: string;
    remoteBaseUrl: string;
    remoteApiKey: string;
    remoteModel: string;
}

/** 解析后的、真正用于请求的 STT 配置 */
export interface ApiConfig {
    mode: SttMode;
    baseUrl: string;
    apiKey: string;
    model: string;
}

export interface TranslateConfig {
    enabled: boolean;
    baseUrl: string;
    apiKey: string;
    model: string;
    targetLang: string;
}

/** 配音（TTS）配置 */
export interface DubConfig {
    enabled: boolean;
    baseUrl: string;
    apiKey: string;
    model: string;
    voice: string;
    /** 是否保留原声（在配音下方压低播放） */
    keepOriginal: boolean;
    /** 保留原声时，原声降低的音量（单位 dB，正值） */
    duckDb: number;
}

function isBrowser(): boolean {
    return typeof window !== "undefined";
}

/** 读取设置面板所需的 STT 原始配置（含默认值回填） */
export function getSttSettings(): SttSettings {
    if (!isBrowser()) {
        return {
            mode: "local",
            localBaseUrl: DEFAULT_LOCAL_BASE_URL,
            localModel: DEFAULT_LOCAL_MODEL,
            remoteBaseUrl: "",
            remoteApiKey: "",
            remoteModel: "",
        };
    }
    const remoteApiKey = localStorage.getItem(KEYS.remoteApiKey) || "";
    const storedMode = localStorage.getItem(KEYS.mode);
    const mode: SttMode =
        storedMode === "local" || storedMode === "remote"
            ? storedMode
            : remoteApiKey
                ? "remote"
                : "local";
    return {
        mode,
        localBaseUrl: localStorage.getItem(KEYS.localBaseUrl) || DEFAULT_LOCAL_BASE_URL,
        localModel: localStorage.getItem(KEYS.localModel) || DEFAULT_LOCAL_MODEL,
        remoteBaseUrl: localStorage.getItem(KEYS.remoteBaseUrl) || "",
        remoteApiKey,
        remoteModel: localStorage.getItem(KEYS.remoteModel) || "",
    };
}

/** 保存 STT 原始配置（只传需要更新的字段） */
export function saveSttSettings(config: Partial<SttSettings>): void {
    if (!isBrowser()) return;
    if (config.mode !== undefined) localStorage.setItem(KEYS.mode, config.mode);
    const mapping: Array<[keyof SttSettings, string]> = [
        ["localBaseUrl", KEYS.localBaseUrl],
        ["localModel", KEYS.localModel],
        ["remoteBaseUrl", KEYS.remoteBaseUrl],
        ["remoteApiKey", KEYS.remoteApiKey],
        ["remoteModel", KEYS.remoteModel],
    ];
    mapping.forEach(([field, storageKey]) => {
        const value = config[field];
        if (value !== undefined) {
            const trimmed = (value || "").trim();
            if (trimmed) localStorage.setItem(storageKey, trimmed);
            else localStorage.removeItem(storageKey);
        }
    });
}

/** 解析出实际用于请求的 STT 配置 */
export function getApiConfig(): ApiConfig {
    const s = getSttSettings();
    if (s.mode === "local") {
        return {
            mode: "local",
            baseUrl: s.localBaseUrl || DEFAULT_LOCAL_BASE_URL,
            apiKey: "",
            model: s.localModel || DEFAULT_LOCAL_MODEL,
        };
    }
    return {
        mode: "remote",
        baseUrl: s.remoteBaseUrl || DEFAULT_BASE_URL,
        apiKey: s.remoteApiKey,
        model: s.remoteModel || DEFAULT_MODEL,
    };
}

/** 是否已填写在线 API Key */
export function hasApiKey(): boolean {
    if (!isBrowser()) return false;
    return !!localStorage.getItem(KEYS.remoteApiKey);
}

/** 当前 STT 是否为本地模式（无需 Key） */
export function isLocalMode(): boolean {
    return getSttSettings().mode === "local";
}

/** 读取翻译配置 */
export function getTranslateConfig(): TranslateConfig {
    if (!isBrowser()) {
        return { enabled: true, baseUrl: "", apiKey: "", model: "", targetLang: DEFAULT_TRANSLATE_TARGET };
    }
    return {
        enabled: localStorage.getItem(KEYS.translateEnabled) !== "false",
        baseUrl: localStorage.getItem(KEYS.translateBaseUrl) || "",
        apiKey: localStorage.getItem(KEYS.translateApiKey) || "",
        model: localStorage.getItem(KEYS.translateModel) || "",
        targetLang: localStorage.getItem(KEYS.translateTarget) || DEFAULT_TRANSLATE_TARGET,
    };
}

/** 保存翻译配置（只传需要更新的字段） */
export function saveTranslateConfig(config: Partial<TranslateConfig>): void {
    if (!isBrowser()) return;
    if (config.enabled !== undefined) {
        localStorage.setItem(KEYS.translateEnabled, config.enabled ? "true" : "false");
    }
    const mapping: Array<[keyof TranslateConfig, string]> = [
        ["baseUrl", KEYS.translateBaseUrl],
        ["apiKey", KEYS.translateApiKey],
        ["model", KEYS.translateModel],
        ["targetLang", KEYS.translateTarget],
    ];
    mapping.forEach(([field, storageKey]) => {
        const value = config[field];
        if (typeof value === "string") {
            const trimmed = value.trim();
            if (trimmed) localStorage.setItem(storageKey, trimmed);
            else localStorage.removeItem(storageKey);
        }
    });
}

/** 读取配音配置 */
export function getDubConfig(): DubConfig {
    if (!isBrowser()) {
        return {
            enabled: false,
            baseUrl: "",
            apiKey: "",
            model: "",
            voice: "",
            keepOriginal: true,
            duckDb: DEFAULT_DUB_DUCK_DB,
        };
    }
    const duckRaw = localStorage.getItem(KEYS.dubDuckDb);
    const duckParsed = duckRaw !== null ? Number(duckRaw) : NaN;
    return {
        enabled: localStorage.getItem(KEYS.dubEnabled) === "true",
        baseUrl: localStorage.getItem(KEYS.dubBaseUrl) || "",
        apiKey: localStorage.getItem(KEYS.dubApiKey) || "",
        model: localStorage.getItem(KEYS.dubModel) || "",
        voice: localStorage.getItem(KEYS.dubVoice) || "",
        keepOriginal: localStorage.getItem(KEYS.dubKeepOriginal) !== "false",
        duckDb: Number.isFinite(duckParsed) ? duckParsed : DEFAULT_DUB_DUCK_DB,
    };
}

/** 保存配音配置（只传需要更新的字段） */
export function saveDubConfig(config: Partial<DubConfig>): void {
    if (!isBrowser()) return;
    if (config.enabled !== undefined) {
        localStorage.setItem(KEYS.dubEnabled, config.enabled ? "true" : "false");
    }
    if (config.keepOriginal !== undefined) {
        localStorage.setItem(KEYS.dubKeepOriginal, config.keepOriginal ? "true" : "false");
    }
    if (config.duckDb !== undefined && Number.isFinite(config.duckDb)) {
        localStorage.setItem(KEYS.dubDuckDb, String(config.duckDb));
    }
    const mapping: Array<[keyof DubConfig, string]> = [
        ["baseUrl", KEYS.dubBaseUrl],
        ["apiKey", KEYS.dubApiKey],
        ["model", KEYS.dubModel],
        ["voice", KEYS.dubVoice],
    ];
    mapping.forEach(([field, storageKey]) => {
        const value = config[field];
        if (typeof value === "string") {
            const trimmed = value.trim();
            if (trimmed) localStorage.setItem(storageKey, trimmed);
            else localStorage.removeItem(storageKey);
        }
    });
}
