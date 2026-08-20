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
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
