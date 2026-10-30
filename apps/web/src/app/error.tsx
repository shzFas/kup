"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <h1 className="text-xl font-semibold">Что-то пошло не так</h1>
      <p className="mt-1 text-gray-500">Попробуйте обновить страницу.</p>
      <button onClick={reset} className="btn-primary mt-6">Повторить</button>
    </div>
  );
}
