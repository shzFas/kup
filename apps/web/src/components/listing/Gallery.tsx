"use client";
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState } from "react";
import { mediaUrl } from "@/lib/config";
import { IconCamera, IconChevronLeft, IconChevronRight, IconExpand, IconX } from "../icons";

export function Gallery({ photos, title }: { photos: string[]; title: string }) {
  const [idx, setIdx] = useState(0);
  const [full, setFull] = useState(false);
  const touchX = useRef<number | null>(null);
  const n = photos.length;
  const go = useCallback((d: number) => setIdx((i) => (i + d + n) % n), [n]);

  useEffect(() => {
    if (!full) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFull(false);
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [full, go]);

  if (n === 0) {
    return (
      <div className="aspect-[4/3] rounded-2xl bg-gray-100 flex flex-col items-center justify-center text-gray-400">
        <IconCamera size={48} />
        <span className="mt-2 text-sm">Нет фото</span>
      </div>
    );
  }

  const swipe = {
    onTouchStart: (e: React.TouchEvent) => (touchX.current = e.touches[0].clientX),
    onTouchEnd: (e: React.TouchEvent) => {
      if (touchX.current == null) return;
      const dx = e.changedTouches[0].clientX - touchX.current;
      if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
      touchX.current = null;
    },
  };

  const Arrows = ({ big }: { big?: boolean }) =>
    n > 1 ? (
      <>
        <button type="button" onClick={(e) => { e.stopPropagation(); go(-1); }} aria-label="Предыдущее фото" className={`absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/85 hover:bg-white shadow ${big ? "p-3" : "p-2"}`}>
          <IconChevronLeft size={big ? 24 : 20} />
        </button>
        <button type="button" onClick={(e) => { e.stopPropagation(); go(1); }} aria-label="Следующее фото" className={`absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/85 hover:bg-white shadow ${big ? "p-3" : "p-2"}`}>
          <IconChevronRight size={big ? 24 : 20} />
        </button>
      </>
    ) : null;

  return (
    <div>
      <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-gray-900 select-none" {...swipe}>
        <img src={mediaUrl(photos[idx])} alt={`${title} — фото ${idx + 1}`} className="w-full h-full object-contain cursor-zoom-in" onClick={() => setFull(true)} />
        <Arrows />
        <span className="absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-0.5 text-xs text-white">{idx + 1} / {n}</span>
        <button type="button" onClick={() => setFull(true)} aria-label="На весь экран" className="absolute bottom-2 right-2 rounded-lg bg-black/60 p-1.5 text-white">
          <IconExpand size={18} />
        </button>
      </div>
      {n > 1 && (
        <div className="mt-2 flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {photos.map((p, i) => (
            <button key={p + i} type="button" onClick={() => setIdx(i)} aria-label={`Фото ${i + 1}`} className={`shrink-0 w-20 h-15 sm:w-24 sm:h-18 rounded-lg overflow-hidden border-2 ${i === idx ? "border-accent-600" : "border-transparent opacity-75 hover:opacity-100"}`}>
              <img src={mediaUrl(p)} alt="" className="w-full h-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      )}
      {full && (
        <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center" role="dialog" aria-modal="true" aria-label="Просмотр фото" onClick={() => setFull(false)} {...swipe}>
          <img src={mediaUrl(photos[idx])} alt={`${title} — фото ${idx + 1}`} className="max-w-full max-h-full object-contain" onClick={(e) => e.stopPropagation()} />
          <Arrows big />
          <button type="button" onClick={() => setFull(false)} aria-label="Закрыть" className="absolute top-3 right-3 rounded-full bg-white/15 p-2 text-white hover:bg-white/25">
            <IconX size={24} />
          </button>
          <span className="absolute top-4 left-4 text-sm text-white/80">{idx + 1} / {n}</span>
        </div>
      )}
    </div>
  );
}
