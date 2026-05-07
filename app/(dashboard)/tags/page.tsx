import { getTags } from "@/app/actions/tags";
import { TagsClient } from "@/components/categories/tags-client";

export default async function TagsPage() {
  const tags = await getTags();
  return <TagsClient initialTags={tags} />;
}
