import { notFound } from "next/navigation";

import { PageSections } from "@saroh/site-blocks";

import { PreviewGone } from "@/components/preview-gone";
import { publicApiUrl } from "@/lib/api-url";
import { findHomePage, getPreviewByToken } from "@/lib/publication";

/** The draft's home page, behind a preview token (#198). */
export default async function PreviewHomePage({
    params,
}: {
    params: Promise<{ token: string }>;
}) {
    const { token } = await params;
    const preview = await getPreviewByToken(token);
    /*
     * Explained HERE as well as in the layout (#284). Next keeps the layout
     * mounted while a reviewer navigates inside the preview, so a link revoked
     * mid-session is met by this page on their next click, and returning null
     * left them an empty page under the draft bar.
     */
    if (!preview.ok) {
        if (preview.reason === "missing") notFound();
        return <PreviewGone reason={preview.reason} />;
    }

    const home = findHomePage(preview.snapshot);
    if (!home) notFound();

    return <PageSections sections={home.sections} apiUrl={publicApiUrl()} />;
}
