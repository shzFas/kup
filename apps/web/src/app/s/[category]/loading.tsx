import { CardSkeleton } from "@/components/ListingCard";

export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="skeleton h-4 w-32" />
      <div className="skeleton h-8 w-60 mt-3" />
      <div className="mt-6 flex gap-6">
        <div className="hidden lg:block w-80 shrink-0 card p-5 space-y-4">
          {Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton h-6" />)}
        </div>
        <div className="flex-1 grid grid-cols-2 md:grid-cols-3 gap-4">
          {Array.from({ length: 6 }, (_, i) => <CardSkeleton key={i} />)}
        </div>
      </div>
    </div>
  );
}
