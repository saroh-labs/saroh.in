import type { Metadata } from "next";
import localFont from "next/font/local";

import { AboutPage } from "@/components/v2/about/about-page";
import { ABOUT } from "@/content/about";
import { LAUNCH_MODE } from "@/lib/links";
import { resourcesContext } from "@/lib/resources-context";
import { pageMetadata } from "@/lib/seo";

/*
 * The page's Hindi, in Noto Sans Devanagari (the design's face): सारोह at
 * display size, its two halves, and the two words that carry them. One
 * variable file (400 to 700), subset to those words' letters and the forms
 * they join into (about 7 KB), self-hosted like every face on the site and
 * fetched on this page only. SIL Open Font License 1.1, Copyright 2022 The
 * Noto Project Authors.
 */
const devanagari = localFont({
    src: "../../fonts/NotoSansDevanagari-about.woff2",
    weight: "400 700",
    style: "normal",
    display: "swap",
    variable: "--font-devanagari",
});

export const metadata: Metadata = pageMetadata({
    title: ABOUT.seo.title,
    socialTitle: ABOUT.seo.socialTitle,
    description: ABOUT.seo.description,
    path: ABOUT.href,
});

/**
 * /about (DEC-137): static, drawn for the site's launch mode and the
 * Resources pages shown at build (`components/v2/about/about-page.tsx`).
 */
export default function AboutRoute() {
    return (
        <div className={devanagari.variable}>
            <AboutPage mode={LAUNCH_MODE} ctx={resourcesContext()} />
        </div>
    );
}
