import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { FavoritesProvider } from "@/lib/favorites";
import { EventsProvider } from "@/lib/events";
import { Header } from "@/components/Header";
import { LangSync } from "@/components/LangSwitcher";
import { getCategories } from "@/lib/server-api";
import { I18nProvider } from "@/i18n/client";
import { getI18n, getLangInfo } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: { default: t("seo.homeTitle"), template: "%s | kup" },
    description: t("seo.homeDescription"),
    applicationName: "kup",
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [{ lang, explicit }, { items: categories }, { t }] = await Promise.all([getLangInfo(), getCategories(), getI18n()]);
  return (
    <html lang={lang}>
      <body className="min-h-screen flex flex-col font-sans antialiased">
        <I18nProvider lang={lang} explicit={explicit}>
          <AuthProvider>
            <LangSync />
            <FavoritesProvider>
              <EventsProvider>
                <Header categories={categories} />
                {/* Keyed by language: client pages remount and refetch API data in the new language. */}
                <main key={lang} className="flex-1">
                  {children}
                </main>
                <footer className="mt-16 border-t border-gray-200 bg-white">
                  <div className="mx-auto max-w-7xl px-4 py-8 text-sm text-gray-500 flex flex-col gap-3">
                    <div className="flex flex-col sm:flex-row gap-2 sm:justify-between">
                      <span>
                        © {new Date().getFullYear()} kup — {t("footer.tagline")}
                      </span>
                      <span>{categories.map((c) => c.name).join(" · ")}</span>
                    </div>
                    <p className="text-xs text-gray-400 max-w-3xl">{t("footer.about")}</p>
                  </div>
                </footer>
              </EventsProvider>
            </FavoritesProvider>
          </AuthProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
