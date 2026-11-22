import type { Metadata } from "next";

import "./library-preview.css";

/** Never a page of its own in search: it is drawn inside /website-library. */
export const metadata: Metadata = {
    title: "Block preview",
    robots: { index: false, follow: false },
};

/**
 * The website library's block previews (DEC-228, plan 2026-11-18-001 KD11):
 * a root layout of their own, so a preview is a merchant's bare page, as
 * saroh.app draws one. No Saroh tokens, fonts, cookie notice, tags or
 * recorder: each preview is a frame inside /website-library, which has
 * them, and a frame must not count as a visit or carry an ad tag.
 */
export default function LibraryPreviewLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en-IN">
            <body className="font-site-body">{children}</body>
        </html>
    );
}
