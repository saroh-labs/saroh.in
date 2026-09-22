"use client";

import { useSyncExternalStore } from "react";

import type {
    RenderedBooking,
    RenderedServicesList,
    SectionType,
} from "@saroh/block-contract";
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
/** Nothing to subscribe to: the answer only changes once, at hydration. */
const noSubscription = () => () => undefined;

/**
 * False while rendering on the server (and during hydration), true after.
 *
 * The two live-data previews draw what only the VIEWER's machine can know:
 * sample open times formatted in the visitor's time zone, prices in their
 * locale. Rendered on the server they come out in the server's zone and locale
 * and then disagree with the browser's first render, which React reports as a
 * hydration mismatch on the catalog's /preview/booking (review of #267). The
 * live blocks never hit this: they load in an effect, after mount.
 */
function useMounted(): boolean {
    return useSyncExternalStore(
        noSubscription,
        () => true,
        () => false,
    );
}

/**
 * The blocks that read live data, and how each is drawn from sample data
 * instead. ONE list: a block here is both drawn with samples and held until
 * mount, so the two cannot drift apart (review of #267). A new live-data
 * block is one entry.
 */
const LIVE_DATA_PREVIEWS: Partial<
    Record<SectionType, (content: unknown) => React.ReactNode>
> = {
    booking: (content) => (
        <BookingSection
            content={content as RenderedBooking}
            slots={sampleSlots()}
        />
    ),
    servicesList: (content) => (
        <ServicesListSection
            content={content as RenderedServicesList}
            services={SAMPLE_SERVICES}
        />
    ),
};

export function BlockFixturePreview({
    type,
    variant,
}: {
    type: SectionType;
    variant: string;
}) {
    const mounted = useMounted();
    const content = blockFixture(type, variant);
    if (!content) return null;
    const live = LIVE_DATA_PREVIEWS[type];
    if (live) return mounted ? live(content) : null;
    return <SectionRenderer section={{ type, content }} />;
}
