import type { RenderedServicesList, SectionType } from "@saroh/block-contract";
import { blockFixture } from "@saroh/block-contract";

import type { Slot } from "./blocks/booking";
import BookingSection from "./blocks/booking";
import type { PublicService } from "./blocks/services-list";
import ServicesListSection from "./blocks/services-list";
import SectionRenderer from "./section-renderer";

/**
 * Services for previewing `servicesList` anywhere there are no real ones: the
 * catalog and the editor's Add-section picker (#255, #267). One has no price,
 * because that case has to look right too.
 */
export const SAMPLE_SERVICES: PublicService[] = [
    {
        id: "fixture-cut",
        name: "Cut and finish",
        description: "Wash, cut and blow-dry.",
        durationMinutes: 45,
        priceCents: 3800,
        currency: "GBP",
    },
    {
        id: "fixture-colour",
        name: "Full colour",
        description:
            "Root to tip, with a toner. Patch test needed 48 hours before.",
        durationMinutes: 120,
        priceCents: 9500,
        currency: "GBP",
    },
    {
        id: "fixture-consult",
        name: "Consultation",
        description: null,
        durationMinutes: 15,
        priceCents: null,
        currency: null,
    },
];

/**
 * Open times for previewing `booking`: tomorrow and the day after, mornings,
 * in the viewer's own time zone as the block itself would show them.
 */
function sampleSlots(): Slot[] {
    const slots: Slot[] = [];
    for (const day of [1, 2]) {
        for (const hour of [9, 10, 11, 14]) {
            const start = new Date();
            start.setDate(start.getDate() + day);
            start.setHours(hour, 0, 0, 0);
            const end = new Date(start.getTime() + 30 * 60 * 1000);
            slots.push({
                startAt: start.toISOString(),
                endAt: end.toISOString(),
            });
        }
    }
    return slots;
}

/**
 * One block's example content, drawn by the real component (#267).
 *
 * The ONE place a fixture becomes a picture, shared by the catalog and the
 * editor's Add-section picker so the two cannot drift: a picker preview that
 * disagreed with what gets inserted would be worse than none. Renders nothing
 * for a variant the block does not declare.
 *
 * The two blocks that read live data are drawn with samples rather than
 * fetching, because a fixture's ids belong to no real record: `servicesList`
 * with {@link SAMPLE_SERVICES}, `booking` with sample open times. A preview is
 * a picture of the block, and must not show a healthy one as broken because a
 * request it never needed failed.
 */
export function BlockFixturePreview({
    type,
    variant,
}: {
    type: SectionType;
    variant: string;
}) {
    const content = blockFixture(type, variant);
    if (!content) return null;
    if (type === "booking") {
        return <BookingSection content={content} slots={sampleSlots()} />;
    }
    if (type === "servicesList") {
        return (
            <ServicesListSection
                content={content as RenderedServicesList}
                services={SAMPLE_SERVICES}
            />
        );
    }
    return <SectionRenderer section={{ type, content }} />;
}
