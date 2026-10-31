import "@saroh/search-pages/styles.css";

import { SearchPage, ToolPage } from "@saroh/search-pages";
import { notFound } from "next/navigation";

import { loadPage, readSearchPages, searchPagesGate } from "@/lib/search-pages";

export const metadata = {
    title: "Preview",
    robots: { index: false, follow: false },
};

/**
 * The page exactly as the site draws it (DEC-193), for the Content tab's
 * frame: the shared template, signed in like every console screen, never
 * indexed, with no links (nothing navigates). Outside the page's tab layout,
 * so no console chrome: a bare light page, as on saroh.in. The root layout's
 * dark class reaches only the console's tokens; the page's own colours are
 * its stylesheet's, so only the ground and the smoothing are set here.
 */
export default async function SearchPagePreview({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const gate = await searchPagesGate();
    if (!gate.ok) return gate.screen;
    const { slug } = await params;
    const page = loadPage(slug);
    // A tool with its own page in saroh.in has nothing to draw here.
    if (!page || (page.kind === "tools" && page.page.inApp)) notFound();
    // GST pages, guides and downloads get their template here with U6 (plan 2026-10-31-002).
    if (page.kind !== "for" && page.kind !== "tools") notFound();
    const data = await readSearchPages();
    const row =
        data.status === "ok"
            ? data.rows.find((r) => r.slug === slug)
            : undefined;

    return (
        <>
            <style>{`html,body{background:#f5f2ec;color-scheme:light;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}`}</style>
            {page.kind === "tools" ? (
                // The email gate has no provider here: it opens and sends nothing.
                <ToolPage page={page.page} draft={!row?.onSite} />
            ) : (
                <SearchPage page={page.page} draft={!row?.onSite} />
            )}
        </>
    );
}
