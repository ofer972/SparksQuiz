import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SparksQuiz",
  description: "Real-time Kahoot-style quiz",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
