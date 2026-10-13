import type { Metadata, Viewport } from "next";
import { Inter, Outfit } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: "字幕工坊 SubCraft — AI 智能字幕",
  description: "字幕工坊（SubCraft）：上传视频或粘贴链接，本地 Whisper 自动生成带时间轴的字幕，可编辑、可导出。",
  icons: {
    icon: "/favicon-subcraft.svg",
  },
  openGraph: {
    title: "字幕工坊 SubCraft — AI 智能字幕",
    description: "字幕工坊（SubCraft）：上传视频或粘贴链接，自动生成带时间轴的字幕，可编辑、可导出。",
    images: [{ url: "/sub-studio-OG.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "字幕工坊 SubCraft — AI 智能字幕",
    description: "字幕工坊（SubCraft）：上传视频或粘贴链接，自动生成带时间轴的字幕，可编辑、可导出。",
    images: ["/sub-studio-OG.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${inter.variable} ${outfit.variable} ${geistMono.variable} antialiased`}
        style={{ fontFamily: "var(--font-inter), system-ui, sans-serif" }}
      >
        {children}
      </body>
    </html>
  );
}
