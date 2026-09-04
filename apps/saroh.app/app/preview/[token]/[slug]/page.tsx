import { notFound } from "next/navigation";

import { PageSections } from "@/components/sections/section-renderer";
import { findPageByPath, getPreviewByToken } from "@/lib/publication";

/** A draft's inner page, behind a preview token (#198). */
export default async function PreviewPage({
    params,
}: {
    params: Promise<{ token: string; slug: string }>;
}) {
    const { token, slug } = await params;
    const preview = await getPreviewByToken(token);
    if (!preview.ok) return null;

    const page = findPageByPath(preview.snapshot, `/${slug}`);
    if (!page) notFound();

    return <PageSections sections={page.sections} />;
}
