import "@saroh/search-pages/styles.css";

import { SearchPage, ToolPage } from "@saroh/search-pages";
import {
    DownloadGate,
    DownloadPage,
    GstPage,
    GuidePage,
} from "@saroh/search-pages/pages";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import type { AnyPage } from "@/lib/search-pages";
import { loadPage, readSearchPages, searchPagesGate } from "@/lib/search-pages";

/**
 * Each kind's template, as saroh.in draws it, with no links: nothing in
 * the preview navigates, a GST tool or /for/ page isn't drawn, and a
 * download's gate is left empty.
 */
const TEMPLATES: {
    [K in AnyPage["kind"]]: (
        page: Extract<AnyPage, { kind: K }>["page"],
        draft: boolean,
    ) => ReactNode;
} = {
    for: (p, draft) => <SearchPage page={p} draft={draft} />,
    // The email gate has no provider here: it opens and sends nothing.
    tools: (p, draft) => <ToolPage page={p} draft={draft} />,
    gst: (p, draft) => <GstPage page={p} draft={draft} />,
    guides: (p, draft) => <GuidePage page={p} draft={draft} />,
    // The download form in preview: it opens, sends and fetches nothing.
    downloads: (p, draft) => (
        <DownloadPage
            page={p}
            draft={draft}
            gate={
                <DownloadGate
                    slug={p.slug}
                    files={p.files}
                    title={p.gate?.title}
                    line={p.gate?.line}
                    preview
                />
            }
        />
    ),
};

const draw = (page: AnyPage, draft: boolean): ReactNode =>
    (TEMPLATES[page.kind] as (p: AnyPage["page"], d: boolean) => ReactNode)(
        page.page,
        draft,
    );

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
    const data = await readSearchPages();
    const row =
        data.status === "ok"
            ? data.rows.find((r) => r.slug === slug)
            : undefined;

    return (
        <>
            <style>{`html,body{background:#f5f2ec;color-scheme:light;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}`}</style>
            {draw(page, !row?.onSite)}
        </>
    );
}
