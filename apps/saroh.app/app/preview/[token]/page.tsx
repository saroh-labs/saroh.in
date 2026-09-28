import { notFound } from "next/navigation";

import { PageSections } from "@saroh/site-blocks";

import { PreviewGone } from "@/components/preview-gone";
import { publicApiUrl } from "@/lib/api-url";
import {
    findHomePage,
    getPreviewByToken,
    getPreviewJournalFeed,
} from "@/lib/publication";
import { getPreviewPlansFeed } from "@/lib/site-plans";

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

    // The draft's posts (G10), as the preview's own index shows them, and
    // the plans on sale now (G9): a draft plan never shows, even here.
    const [journal, plans] = await Promise.all([
        getPreviewJournalFeed(home.sections, preview.snapshot, token),
        getPreviewPlansFeed(
            home.sections,
            preview.snapshot,
            preview.siteId,
            token,
        ),
    ]);

    return (
        <PageSections
            sections={home.sections}
            apiUrl={publicApiUrl()}
            siteId={preview.siteId}
            journal={journal}
            plans={plans}
        />
    );
}
