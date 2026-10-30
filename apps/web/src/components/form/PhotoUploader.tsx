"use client";
/* eslint-disable @next/next/no-img-element */
import { useRef, useState } from "react";
import { api } from "@/lib/client-api";
import { errorMessage } from "@/lib/errors";
import { mediaUrl } from "@/lib/config";
import { IconArrowDown, IconArrowUp, IconCamera, IconChevronLeft, IconChevronRight, IconX } from "../icons";

export interface PhotoItem {
  key: string;
  id?: string;
  url?: string;
  preview?: string;
  uploading?: boolean;
  error?: string;
}

const MAX = 20;
const MAX_BYTES = 10 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

export function PhotoUploader({ photos, onChange, error }: { photos: PhotoItem[]; onChange: (fn: (prev: PhotoItem[]) => PhotoItem[]) => void; error?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function addFiles(files: FileList | null) {
    if (!files) return;
    setNotice(null);
    const room = MAX - photos.length;
    const list = Array.from(files);
    if (list.length > room) setNotice(`Можно загрузить не больше ${MAX} фото`);
    const accepted: { file: File; item: PhotoItem }[] = [];
    for (const file of list.slice(0, Math.max(0, room))) {
      if (!TYPES.includes(file.type)) {
        setNotice("Поддерживаются только JPEG, PNG и WebP");
        continue;
      }
      if (file.size > MAX_BYTES) {
        setNotice("Файл больше 10 МБ пропущен");
        continue;
      }
      const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      accepted.push({ file, item: { key, preview: URL.createObjectURL(file), uploading: true } });
    }
    if (!accepted.length) return;
    onChange((prev) => [...prev, ...accepted.map((a) => a.item)]);
    for (const { file, item } of accepted) {
      api()
        .uploadPhoto(file)
        .then((r) => onChange((prev) => prev.map((p) => (p.key === item.key ? { ...p, id: r.id, url: r.url, uploading: false } : p))))
        .catch((e) => onChange((prev) => prev.map((p) => (p.key === item.key ? { ...p, uploading: false, error: errorMessage(e, "Ошибка загрузки") } : p))));
    }
  }

  const move = (i: number, d: number) =>
    onChange((prev) => {
      const j = i + d;
      if (j < 0 || j >= prev.length) return prev;
      const n = [...prev];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  const remove = (key: string) => onChange((prev) => prev.filter((p) => p.key !== key));

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {photos.map((p, i) => (
          <div key={p.key} className={`relative aspect-[4/3] rounded-xl overflow-hidden border ${p.error ? "border-red-300" : "border-gray-200"} bg-gray-100`}>
            <img src={p.preview ?? (p.url ? mediaUrl(p.url) : "")} alt={`Фото ${i + 1}`} className={`w-full h-full object-cover ${p.uploading ? "opacity-50" : ""}`} />
            {i === 0 && !p.error && <span className="absolute top-1.5 left-1.5 rounded-md bg-accent-600 px-1.5 py-0.5 text-[11px] font-medium text-white">Обложка</span>}
            {p.uploading && (
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="w-7 h-7 rounded-full border-[3px] border-white border-t-accent-600 animate-spin" />
              </span>
            )}
            {p.error && <span className="absolute inset-x-0 bottom-8 mx-1.5 rounded bg-red-600/90 px-1.5 py-0.5 text-[11px] text-white text-center">{p.error}</span>}
            <button type="button" onClick={() => remove(p.key)} aria-label="Удалить фото" className="absolute top-1.5 right-1.5 rounded-full bg-black/60 p-1 text-white hover:bg-black/80">
              <IconX size={14} />
            </button>
            <div className="absolute bottom-1.5 right-1.5 flex gap-1">
              <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Переместить раньше" className="rounded-md bg-white/90 p-1 disabled:opacity-40">
                <IconChevronLeft size={14} className="hidden sm:block" />
                <IconArrowUp size={14} className="sm:hidden" />
              </button>
              <button type="button" disabled={i === photos.length - 1} onClick={() => move(i, 1)} aria-label="Переместить позже" className="rounded-md bg-white/90 p-1 disabled:opacity-40">
                <IconChevronRight size={14} className="hidden sm:block" />
                <IconArrowDown size={14} className="sm:hidden" />
              </button>
            </div>
          </div>
        ))}
        {photos.length < MAX && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            className={`aspect-[4/3] rounded-xl border-2 border-dashed ${error ? "border-red-300" : "border-gray-300"} hover:border-accent-500 hover:bg-accent-50 flex flex-col items-center justify-center text-gray-500 hover:text-accent-700 transition`}
          >
            <IconCamera size={28} />
            <span className="mt-1 text-sm font-medium">Добавить фото</span>
            <span className="text-xs text-gray-400">{photos.length} / {MAX}</span>
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <p className="mt-2 text-xs text-gray-500">JPEG, PNG или WebP до 10 МБ. Первое фото — обложка; порядок меняется стрелками.</p>
      {notice && <p className="mt-1 text-sm text-amber-700">{notice}</p>}
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
