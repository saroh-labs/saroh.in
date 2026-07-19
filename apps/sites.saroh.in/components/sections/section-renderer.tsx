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
 * Render an ordered list of sections. Snapshot sections are already in display
 * order, so we key by index (positions are stable within an immutable
 * snapshot).
 */
export function PageSections({ sections }: { sections: Section[] }) {
    return (
        <>
            {sections.map((section, i) => (
                <SectionRenderer key={i} section={section} />
            ))}
        </>
    );
}
