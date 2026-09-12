import "@/app/globals.css";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { QueryProvider } from "@/app/[locale]/providers/queryProvider";

const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const geistInter = Geist({ variable: "--font-geist-inter", subsets: ["latin"] });

export default function PlatformAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className={`${geistInter.variable} ${geistMono.variable} antialiased`}>
        <QueryProvider>
          {children}
          <Toaster position="top-right" richColors />
        </QueryProvider>
      </body>
    </html>
  );
}
