export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="skeleton h-4 w-64 mb-4" />
      <div className="grid lg:grid-cols-[1fr_360px] gap-6">
        <div className="skeleton aspect-[4/3] rounded-2xl" />
        <div className="space-y-3">
          <div className="skeleton h-44 rounded-2xl" />
          <div className="skeleton h-20 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
