"use client";

import type { Section, SitePage } from "@/lib/sites/service";

import { BookingFields } from "./booking";
import { CtaFields } from "./cta";
import { EnquiryFields } from "./enquiry";
import { FeaturesFields } from "./features";
import { GalleryFields } from "./gallery";
import { HeroFields } from "./hero";
import { RichTextFields } from "./rich-text";
import type { ServiceOption } from "./types";
import { VariantField } from "./variant-field";

/**
 * The per-type editor for one section.
 *
 * Split out of `site-editor.tsx` (#260). That file was 2759 lines against a
 * repo standard of 400, and roughly 700 of them were this switch — so every new
 * block type meant editing the middle of the largest component in the app.
 * Adding a block is now adding a file beside this one and a line here.
 *
 * The switch stays rather than becoming a lookup table because it is what
 * NARROWS `section` to the exact variant: `Section` is a discriminated union on
 * `type`, and a `Record<SectionType, Component>` would lose that and need a
 * cast per entry. Twenty lines of switch that the compiler checks beats a table
 * that it cannot.
 *
 * An unknown type renders nothing, matching how the public renderer degrades a
 * section type it does not know (#252) — a draft carrying a type from a newer
 * contract should be uneditable, not fatal.
 */
export function SectionFields({
    section,
    services,
    pages,
    onChange,
}: {
    section: Section;
    services: ServiceOption[];
    /** The site's pages, so a button can pick one rather than type a path. */
    pages: SitePage[];
    onChange: (next: Section) => void;
}) {
    return (
        <div className="grid gap-3">
            <VariantField section={section} onChange={onChange} />
            {perTypeFields({ section, services, pages, onChange })}
        </div>
    );
}

/**
 * The block's own fields, below the look picker the dispatcher renders.
 *
 * The switch stays rather than becoming a lookup table because it is what
 * NARROWS `section` to the exact variant — see the note above.
 */
function perTypeFields({
    section,
    services,
    pages,
    onChange,
}: {
    section: Section;
    services: ServiceOption[];
    pages: SitePage[];
    onChange: (next: Section) => void;
}) {
    switch (section.type) {
        case "hero":
            return (
                <HeroFields
                    section={section}
                    pages={pages}
                    services={services}
                    onChange={onChange}
                />
            );
        case "richText":
            return (
                <RichTextFields
                    section={section}
                    pages={pages}
                    services={services}
                    onChange={onChange}
                />
            );
        case "cta":
            return (
                <CtaFields
                    section={section}
                    pages={pages}
                    services={services}
                    onChange={onChange}
                />
            );
        case "gallery":
            return (
                <GalleryFields
                    section={section}
                    pages={pages}
                    services={services}
                    onChange={onChange}
                />
            );
        case "enquiry":
            return (
                <EnquiryFields
                    section={section}
                    pages={pages}
                    services={services}
                    onChange={onChange}
                />
            );
        case "features":
            return (
                <FeaturesFields
                    section={section}
                    pages={pages}
                    services={services}
                    onChange={onChange}
                />
            );
        case "booking":
            return (
                <BookingFields
                    section={section}
                    pages={pages}
                    services={services}
                    onChange={onChange}
                />
            );
        default:
            return assertExhaustive(section);
    }
}

/**
 * A block type added to `SECTION_TYPES` without an editor here does not
 * compile.
 *
 * The same guarantee `SECTION_LABELS: Record<SectionType, string>` already
 * gives for labels, and the reason a forgotten section type has never silently
 * shipped. Returns `null` at runtime so a draft from a newer contract renders
 * an empty editor rather than throwing.
 */
function assertExhaustive(_section: never): null {
    return null;
}

export type { ServiceOption } from "./types";
