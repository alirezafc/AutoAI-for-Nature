import type { Metadata } from "next";
import { Inter, Merriweather } from "next/font/google";
import { cookies } from "next/headers";
import { isLocale, isRTL, DEFAULT_LOCALE, type Locale } from "@/lib/i18n";
import { IntlProvider } from "@/components/i18n/intl-provider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const merriweather = Merriweather({
  weight: ["300", "400", "700", "900"],
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AutoAI for Nature — AI-Native Nature Content Platform",
  description:
    "AutoAI for Nature is an AI-native content and knowledge platform: a multi-agent editorial pipeline for nature stories, a RAG chatbot grounded in a knowledge base, voice assistant, MCP server and workflow automation.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const store = await cookies();
  const cookieLocale = store.get("autoai_locale")?.value;
  const locale: Locale = cookieLocale && isLocale(cookieLocale) ? (cookieLocale as Locale) : DEFAULT_LOCALE;
  const dir = isRTL(locale) ? "rtl" : "ltr";

  return (
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <body className={`${inter.variable} ${merriweather.variable} font-sans`}>
        <IntlProvider initialLocale={locale}>{children}</IntlProvider>
      </body>
    </html>
  );
}
