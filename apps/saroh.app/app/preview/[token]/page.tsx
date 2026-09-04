import { notFound } from "next/navigation";

import { PageSections } from "@/components/sections/section-renderer";
import { findHomePage, getPreviewByToken } from "@/lib/publication";

/** The draft's home page, behind a preview token (#198). */
export default async function PreviewHomePage({
    params,
}: {
    params: Promise<{ token: string }>;
}) {
    const { token } = await params;
    const preview = await getPreviewByToken(token);
    // The layout has already explained an expired or revoked link; a page
    // under it renders nothing rather than a second, contradictory message.
    if (!preview.ok) return null;

    const home = findHomePage(preview.snapshot);
    if (!home) notFound();

    return <PageSections sections={home.sections} />;
}
