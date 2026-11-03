import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { FavoritesProvider } from "@/lib/favorites";
import { EventsProvider } from "@/lib/events";
import { Header } from "@/components/Header";
import { getCategories } from "@/lib/server-api";

export const metadata: Metadata = {
  title: { default: "kup — объявления: авто, мото, квартиры", template: "%s | kup" },
  description: "kup — доска объявлений Казахстана: автомобили, мотоциклы, мопеды и скутеры, квартиры. Удобные фильтры и свежие предложения.",
  applicationName: "kup",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { items: categories } = await getCategories();
  return (
    <html lang="ru">
      <body className="min-h-screen flex flex-col font-sans antialiased">
        <AuthProvider>
          <FavoritesProvider>
          <EventsProvider>
            <Header categories={categories} />
            <main className="flex-1">{children}</main>
            <footer className="mt-16 border-t border-gray-200 bg-white">
              <div className="mx-auto max-w-7xl px-4 py-8 text-sm text-gray-500 flex flex-col sm:flex-row gap-2 sm:justify-between">
                <span>© {new Date().getFullYear()} kup — доска объявлений</span>
                <span>Автомобили · Мотоциклы · Мопеды · Квартиры</span>
              </div>
            </footer>
          </EventsProvider>
          </FavoritesProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
