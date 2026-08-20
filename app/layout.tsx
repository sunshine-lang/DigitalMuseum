import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Digital Museum · AI 人生档案馆",
  description: "把散落的数字痕迹，变成可核验、可策展的人生博物馆。",
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
