import { getCategories } from "@/app/actions/categories";
import { getActiveTags } from "@/app/actions/tags";
import { CategoriesClient } from "@/components/categories/categories-client";

export default async function CategoriesPage() {
  const [categories, tags] = await Promise.all([getCategories(), getActiveTags()]);
  return <CategoriesClient initialCategories={categories} availableTags={tags} />;
}
