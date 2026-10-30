import type { Metadata } from "next";
import { AuthGate } from "@/components/AuthGate";
import { MyListings } from "./MyListings";

export const metadata: Metadata = { title: "Мои объявления", robots: { index: false } };

export default function MyPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
      <AuthGate>
        <MyListings />
      </AuthGate>
    </div>
  );
}
