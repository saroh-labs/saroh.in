import { ClosingBand } from "./page-parts";

/** What every content page and hub is handed by the site: none of it in the admin preview. */
export interface ContentLinks {
    home?: string;
    /** The kind's hub: `/gst`. */
    hub?: string;
    startFree?: string;
    startFreeLabel?: string;
    /** The band button's `data-cta`: `gst-<slug>`, `gst-hub`. */
    src?: string;
    /** A link in the page's words: its address on this site, or none. */
    resolve?: (href: string) => string | undefined;
}

/** A page's closing band: its own words, or its kind's. */
export function PageBand({
    look,
    band,
    links,
}: {
    look: "wide" | "stack";
    band: { title: string; line: string };
    links: ContentLinks;
}) {
    return (
        <ClosingBand
            look={look}
            title={band.title}
            line={band.line}
            href={links.startFree}
            label={links.startFreeLabel}
            src={links.src}
        />
    );
}
