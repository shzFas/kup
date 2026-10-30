import { notFound } from "next/navigation";
import { getSchema, isNotFound } from "@/lib/server-api";

/** Validates the category above the loading boundary so unknown slugs get a real 404 status. */
export default async function CategoryLayout({ children, params }: { children: React.ReactNode; params: Promise<{ category: string }> }) {
  const { category } = await params;
  try {
    await getSchema(category);
  } catch (e) {
    if (isNotFound(e)) notFound();
    // other errors: let the page render its own error state
  }
  return children;
}
