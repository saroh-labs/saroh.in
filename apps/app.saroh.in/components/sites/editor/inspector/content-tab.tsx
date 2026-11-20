"use client";

import { Button } from "@saroh/ui/button";
import { TextLink } from "@saroh/ui/text-link";
import { Info } from "lucide-react";

import { BOUND_BLOCKS, boundHref } from "@/components/sites/blocks/block-kinds";
import type { HeldBackSection } from "@/components/sites/blocks/saveable-sections";
import type { ServicesLoad } from "@/components/sites/section-fields";
import { SectionFields } from "@/components/sites/section-fields";
import { SectionFrameFields } from "@/components/sites/section-fields/frame";
import type { Flag, Section, SitePage } from "@/lib/sites/service";

import { useEditorReadOnly } from "../read-only";
import { BoundServices } from "./bound-services";

export interface ContentTabProps {
    siteId: string;
    section: Section;
    pages: SitePage[];
    /** The org's services (`useServicesForPicker`), for bound sections. */
    services: ServicesLoad;
    /** This section's advisory flags. */
    flags: Flag[];
    /** Its stored content fails its contract (#275). */
    unreadable: boolean;
    /** The last save's error, when it was about this section. */
    error: string | null;
    /** Why this section is waiting to save, if it is. */
    heldBack: HeldBackSection | undefined;
    onChange: (next: Section) => void;
    /** A price in "From Services" was pressed: open the price sheet (U48). */
    onPrice?: (serviceId: string) => void;
    /** A reader's "Add a note on this block": opens its Feedback. */
    onAddNote?: () => void;
}

/**
 * Inspector › Content (U47, `fix/WXKSelected`): the section's own words and
 * choices, today's block form without its look picker (Style has it) and
 * band (Style › Background). A bound section lists what it shows from
 * Services. A reader sees the same fields, disabled at once by the fieldset.
 * The phone's section sheet (U49) draws this same pane.
 */
export function ContentTab({
    siteId,
    section,
    pages,
    services,
    flags,
    unreadable,
    error,
    heldBack,
    onChange,
    onPrice,
    onAddNote,
}: ContentTabProps) {
    const readOnly = useEditorReadOnly();
    const bound = BOUND_BLOCKS[section.type];
    const boundLink = bound ? boundHref(bound, siteId) : null;

    return (
        <div className="grid gap-4">
            {bound ? (
                <div className="flex gap-2.5 rounded-lg bg-muted p-3 text-[0.8125rem] leading-relaxed text-foreground">
                    <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
                    <div className="space-y-2">
                        <p>{bound.notice}</p>
                        {/* A new tab: leaving mid-edit drops unsent work. */}
                        {boundLink ? (
                            <TextLink href={boundLink} external>
                                {bound.linkLabel}
                            </TextLink>
                        ) : null}
                    </div>
                </div>
            ) : null}

            <BoundServices
                section={section}
                services={services}
                onPrice={readOnly ? undefined : onPrice}
            />

            <fieldset disabled={readOnly} className="contents">
                <SectionFields
                    section={section}
                    services={services}
                    pages={pages}
                    onChange={onChange}
                    variant={false}
                />
                {unreadable ? (
                    <p className="rounded-md border border-dashed p-3 text-xs leading-relaxed text-muted-foreground">
                        Saroh cannot read this block&apos;s saved content. The
                        fields may look empty even though something is stored.
                        Editing and saving will replace whatever is there.
                    </p>
                ) : null}
                {flags.length > 0 ? (
                    <ul className="grid gap-1.5 border-t pt-3">
                        {flags.map((flag, i) => (
                            <li
                                key={i}
                                className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"
                            >
                                <span
                                    aria-hidden="true"
                                    className="mt-1.5 size-1 shrink-0 rounded-full bg-foreground"
                                />
                                <span>{flag.message}</span>
                            </li>
                        ))}
                    </ul>
                ) : null}
                <SectionFrameFields
                    key={section.key}
                    section={section}
                    onChange={onChange}
                    band={false}
                />
            </fieldset>

            {error ? (
                <p className="text-sm text-destructive">{error}</p>
            ) : heldBack ? (
                <p role="status" className="text-sm text-destructive">
                    {heldBack.message}
                </p>
            ) : null}

            {readOnly && onAddNote ? (
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={onAddNote}
                >
                    Add a note on this block
                </Button>
            ) : null}
        </div>
    );
}
