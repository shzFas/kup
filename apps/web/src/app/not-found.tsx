import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <div className="text-6xl font-extrabold text-accent-600">404</div>
      <h1 className="mt-3 text-xl font-semibold">Страница не найдена</h1>
      <p className="mt-1 text-gray-500">Возможно, она была удалена или вы перешли по неверной ссылке.</p>
      <Link href="/" className="btn-primary mt-6">На главную</Link>
    </div>
  );
}
