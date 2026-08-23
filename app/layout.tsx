import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://digital-museum-demo.xiaoyd7up.chatgpt.site"),
  title: "Digital Museum · AI 人生档案馆",
  description: "把散落的数字痕迹，变成可核验、可策展的人生博物馆。",
  openGraph: {
    title: "Digital Museum · AI 人生档案馆",
    description: "把散落的数字痕迹，变成可核验、可策展的人生博物馆。",
    type: "website",
    images: [{ url: "/og.png", width: 1731, height: 909, alt: "Digital Museum 品牌分享卡片" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Digital Museum · AI 人生档案馆",
    description: "把散落的数字痕迹，变成可核验、可策展的人生博物馆。",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  other: {
    "codex-preview": "development",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* App Router 根布局即全站文档；no-page-custom-font 仅适用于 Pages Router。 */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,700;0,900;1,500&family=Noto+Serif+SC:wght@600;900&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
