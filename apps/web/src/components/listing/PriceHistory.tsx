import { formatPrice } from "@kup/shared";
import { formatDate } from "@/lib/status";
import { IconTrendDown } from "../icons";

/** Inline SVG step chart of the price history (oldest → newest). Renders nothing for < 2 points. */
export function PriceHistory({ history, currency, suffix = "" }: { history: { price: number; at: string }[]; currency: string; suffix?: string }) {
  const pts = [...(history ?? [])].filter((p) => Number.isFinite(p.price)).sort((a, b) => a.at.localeCompare(b.at));
  if (pts.length < 2) return null;
  const W = 320, H = 96, PX = 8, PT = 10, PB = 10;
  const t0 = new Date(pts[0].at).getTime();
  const t1 = Math.max(new Date(pts[pts.length - 1].at).getTime(), t0 + 1);
  // Extend the last step a bit to the right so the current price is visible.
  const tEnd = t1 + (t1 - t0) * 0.12;
  const prices = pts.map((p) => p.price);
  const lo = Math.min(...prices), hi = Math.max(...prices);
  const span = hi - lo || 1;
  const x = (t: number) => PX + ((t - t0) / (tEnd - t0)) * (W - 2 * PX);
  const y = (p: number) => PT + (1 - (p - lo) / span) * (H - PT - PB);
  let d = `M${x(t0).toFixed(1)},${y(pts[0].price).toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const xi = x(new Date(pts[i].at).getTime()).toFixed(1);
    d += ` H${xi} V${y(pts[i].price).toFixed(1)}`;
  }
  d += ` H${x(tEnd).toFixed(1)}`;
  const first = pts[0].price, last = pts[pts.length - 1].price;
  const drop = first - last;
  const fmt = (p: number) => formatPrice(p, currency, suffix);

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">История цены</h2>
        {drop > 0 && (
          <span className="inline-flex items-center gap-1 rounded-lg bg-green-50 text-green-700 border border-green-200 px-2 py-1 text-sm font-medium">
            <IconTrendDown size={16} /> Цена снижена на {fmt(drop)}
          </span>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full h-24 text-accent-600" role="img" aria-label={`Цена изменилась с ${fmt(first)} до ${fmt(last)}`}>
        <line x1={PX} x2={W - PX} y1={y(lo)} y2={y(lo)} stroke="#e5e7eb" strokeDasharray="3 3" />
        <line x1={PX} x2={W - PX} y1={y(hi)} y2={y(hi)} stroke="#e5e7eb" strokeDasharray="3 3" />
        <path d={d} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {pts.map((p, i) => (
          <circle key={i} cx={x(new Date(p.at).getTime())} cy={y(p.price)} r={3} fill="white" stroke="currentColor" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <ol className="mt-2 space-y-1 text-sm">
        {[...pts].reverse().map((p, i, arr) => {
          const prev = arr[i + 1];
          const diff = prev ? p.price - prev.price : 0;
          return (
            <li key={p.at + i} className="flex justify-between gap-4 py-1 border-b border-dashed border-gray-100 last:border-0">
              <span className="text-gray-500" suppressHydrationWarning>{formatDate(p.at)}</span>
              <span className="font-medium">
                {fmt(p.price)}
                {diff !== 0 && <span className={`ml-2 text-xs ${diff < 0 ? "text-green-600" : "text-red-600"}`}>{diff < 0 ? "−" : "+"}{fmt(Math.abs(diff))}</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
