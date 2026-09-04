import type {
    BookingContent,
    CtaContent,
    EnquiryContent,
    GalleryContent,
    HeroContent,
    RichTextContent,
    Section,
} from "@/lib/publication";

import BookingSection from "./booking";
import CtaSection from "./cta";
import EnquirySection from "./enquiry";
import GallerySection from "./gallery";
import HeroSection from "./hero";
import RichTextSection from "./rich-text";

/**
 * Maps a publication {@link Section} to its presentational component by
 * `section.type`.
 *
 * A section's `content` arrives from the public snapshot API as `unknown`
 * (it is JSON), so we narrow it per `type` at the point of use before handing
 * it to the typed section component. The content itself is trusted, controlled
 * data: it was validated against the v1 section contract AND (for `richText`)
 * sanitized server-side at publish, so this renderer never handles raw author
 * input — see the safety note in `components/sections/rich-text.tsx`.
 *
 * Forward-compatibility: an unknown/unsupported `type` renders `null` rather
 * than throwing, so a snapshot published against a newer contract (with a
 * section type this build does not know) degrades gracefully instead of
 * crashing the whole page.
 */
export default function SectionRenderer({ section }: { section: Section }) {
    switch (section.type) {
        case "hero":
            return <HeroSection content={section.content as HeroContent} />;
        case "richText":
            return (
                <RichTextSection content={section.content as RichTextContent} />
            );
        case "cta":
            return <CtaSection content={section.content as CtaContent} />;
        case "gallery":
            return (
                <GallerySection content={section.content as GalleryContent} />
            );
        case "enquiry":
            return (
                <EnquirySection content={section.content as EnquiryContent} />
            );
        case "booking":
            return (
                <BookingSection content={section.content as BookingContent} />
            );
        default:
            // Unknown section type (e.g. from a newer contract version) —
            // render nothing rather than crash.
            return null;
    }
}

/**
 * A section's own padding override, if it set one (#189).
 *
 * Read defensively: `content` is JSON from a snapshot, so the field may be
 * absent, of the wrong type, or from an older contract that had no such thing.
 * The contract bounds it to 24–96px on the way in; re-clamping here means a
 * value that predates those bounds cannot produce a section a page-length tall.
 */
function paddingOverride(content: unknown): React.CSSProperties | undefined {
    if (content === null || typeof content !== "object") return undefined;
    const value = (content as { padding?: unknown }).padding;
    if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
    const px = Math.min(96, Math.max(24, Math.round(value)));
    // Set one level down from the site variable, so a section that overrides
    // padding does so for its own subtree and hands the setting back after.
    return { "--site-section-padding": `${px}px` } as React.CSSProperties;
}

/**
 * Render an ordered list of sections. Snapshot sections are already in display
 * order, so we key by index (positions are stable within an immutable
 * snapshot).
 *
 * The wrapper exists to carry a per-section padding override. It used to be
 * absent, so a merchant could set a section's padding in the editor, watch the
 * preview honour it, publish, and see the live site ignore it.
 */
export function PageSections({ sections }: { sections: Section[] }) {
    return (
        <>
            {sections.map((section, i) => {
                const style = paddingOverride(section.content);
                const rendered = <SectionRenderer section={section} />;
                return style === undefined ? (
                    <div key={i}>{rendered}</div>
                ) : (
                    <div key={i} style={style}>
                        {rendered}
                    </div>
                );
            })}
        </>
    );
}
