"use client";

import { FailedRead } from "@/components/shared/states/failed-read";
import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";
import { useState } from "react";

import {
    BusinessRows,
    ComingSoon,
    EditRow,
} from "@/components/organizations/business-settings/business-row-parts";
import type { OfferUndo } from "@/components/organizations/business-settings/use-settings-undo";
import { Absent, Row } from "@/components/shared/page/settings-rows";
import { BUSINESS_ROW_ID } from "@/lib/organizations/business-rows";
import { sameWeek } from "@/lib/organizations/opening-hours";
import { newStorefrontHref } from "@/lib/stores/links";
import { weekSummary } from "@/lib/stores/opening-hours-summary";
import type {
    StorefrontHours,
    StorefrontHoursRead,
} from "@/lib/stores/storefronts";
import { BusinessHoursSheet } from "./business-hours-sheet";

import type { BusinessSheets } from "@/components/organizations/business-settings/use-business-sheets";

export const HOURS_SECTION = {
    title: "Hours",
    lead: "When you're open. Bookings and pick-up follow this.",
} as const;

const NOTE =
    "Applies to every location. Online orders placed while you're closed are ready from the next opening time.";

const LINK =
    "font-semibold text-foreground underline underline-offset-2 hover:decoration-2 active:text-muted-foreground";

/** Whether the read has a location whose hours can be changed. */
export const hasHoursToEdit = (hours: StorefrontHoursRead) =>
    hours.state === "ok" && hours.storefronts.length > 0;

/**
 * Business → Hours, read first (owner, 10 Oct): when the business is open,
 * as one row saying the week the way a shop writes it on its door, edited
 * in its side sheet (`business-hours-sheet.tsx`).
 *
 * The week is real, but it is kept per location (`openingHours`, Monday
 * first), so the row reads the first location's and Save writes every
 * location. When they differ, the tab says so before a Save makes them the
 * same. A business with no location has nowhere to keep hours, so the tab
 * says that and links to making one rather than offering an Edit that
 * would go nowhere.
 *
 * Closed-on dates and the booking-page banner have no home in the API yet:
 * they are rows marked "Coming soon", with nothing to edit.
 */
export function BusinessHoursSection({
    hours,
    canEdit,
    hidden,
    sheets,
    offerUndo,
}: {
    hours: StorefrontHoursRead;
    /** May change the business's settings and its locations. */
    canEdit: boolean;
    /**
     * Another tab is showing. The tab stays mounted so what a save
     * answered is still what it reads when it is looked at again.
     */
    hidden: boolean;
    sheets: BusinessSheets;
    /** Says the save landed, with Undo while the week can be put back (F12). */
    offerUndo: OfferUndo;
}) {
    // What the API last said, so the row reads a save at once.
    const [stores, setStores] = useState<StorefrontHours[]>(
        hours.state === "ok" ? hours.storefronts : [],
    );
    // Hours that couldn't be read and then arrive (Try again reads the
    // page again) start the row from them, or it would stay empty.
    const [arrived, setArrived] = useState(hours.state === "ok");
    if (hours.state === "ok" && !arrived) {
        setArrived(true);
        setStores(hours.storefronts);
    }
    const first = stores.at(0);
    const week = first?.openingHours ?? null;
    const differ = stores.some((s) => !sameWeek(s.openingHours, week));
    const editing = sheets.editing?.which === "hours" ? sheets.editing : null;

    const notice =
        hours.state === "sell-off" ? (
            <>
                Hours are kept on your locations, and Sell is switched off.{" "}
                <Link href="/settings/modules" className={LINK}>
                    Turn on Sell
                </Link>
            </>
        ) : hours.state === "unavailable" ? (
            <FailedRead
                things="your locations' hours"
                reassurance="They can't be changed here until they load."
            />
        ) : !first ? (
            <>
                Hours are kept on a location, and this business has none yet.{" "}
                <Link href={newStorefrontHref} className={LINK}>
                    Create a location
                </Link>
            </>
        ) : differ ? (
            <>
                Your locations have different hours. This shows {first.name}
                &apos;s, and saving sets them all to these.
            </>
        ) : undefined;

    return (
        <div
            id="business-hours-panel"
            role="tabpanel"
            aria-labelledby="business-tab-hours"
            className={cn(
                "grid min-w-0 flex-[1_1_460px] gap-4",
                hidden && "hidden",
            )}
        >
            <BusinessRows
                title={HOURS_SECTION.title}
                lead={HOURS_SECTION.lead}
                notice={notice}
                note={NOTE}
            >
                <Row
                    id={BUSINESS_ROW_ID.hours}
                    label="Opening hours"
                    action={
                        canEdit && first ? (
                            week ? (
                                <EditRow
                                    sheet="hours"
                                    sheets={sheets}
                                    name="Edit opening hours"
                                />
                            ) : (
                                <EditRow
                                    sheet="hours"
                                    sheets={sheets}
                                    label="Set hours"
                                />
                            )
                        ) : null
                    }
                >
                    <span
                        data-testid="business-hours-summary"
                        className="block tabular-nums"
                    >
                        {week ? (
                            weekSummary(week)
                        ) : (
                            <Absent>Not set yet</Absent>
                        )}
                    </span>
                </Row>
                <Row label="Closed on">
                    <span className="flex flex-wrap items-baseline gap-2">
                        <Absent>No closures planned</Absent>
                        <ComingSoon />
                    </span>
                </Row>
                <Row label="Booking page">
                    <span className="flex flex-wrap items-baseline gap-2">
                        <span>Doesn&apos;t mention closures</span>
                        <ComingSoon />
                    </span>
                </Row>
            </BusinessRows>

            {/* The open sheet, a fresh draft each time it opens. */}
            {editing && canEdit && first ? (
                <BusinessHoursSheet
                    key={editing.opened}
                    stores={stores}
                    differ={differ}
                    open={editing.open}
                    returnTo={editing.returnTo}
                    onClose={sheets.close}
                    onStores={setStores}
                    onSaved={offerUndo}
                />
            ) : null}
        </div>
    );
}
