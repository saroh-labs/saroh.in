"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { TextLink } from "@saroh/ui/text-link";
import { useState } from "react";

import { FailedRead } from "@/components/shared/failed-read";
import { callName } from "@/lib/services/call-name";
import type { AvailabilityRule } from "@/lib/services/service";
import { AVAILABILITY_HREF } from "@/lib/services/service-cards";
import type { ServiceDraft } from "@/lib/services/service-editor";
import {
    HOURS_SECTION,
    hoursNote,
    timesComeFrom,
    whoseHours,
} from "@/lib/services/service-editor";
import type { StaffView } from "@/lib/staff/types";

import { HELP, LABEL, Section } from "./fields";
import { HoursField } from "./hours-field";

/**
 * When it can be booked (Bookings audit, 12 Oct 2026): what gives the
 * service its times, in a card of its own after Time. It used to be the
 * last thing under a closed "More settings", though it decides whether
 * anyone can book at all.
 *
 * A one-to-one someone takes books in that person's hours: the card says
 * whose, with the way to Availability, where they are changed. Its own
 * weekly hours only narrow theirs, so they show when it has some, or when
 * asked for. A class, and a one-to-one nobody takes, book in the service's
 * own weekly hours: the editor is the card.
 *
 * The rows are part of the page's draft and go with its one Save.
 */
export function HoursCard({
    draft,
    set,
    hoursProblem,
    startedFromOpening,
    rules,
    people,
    canEdit,
}: {
    draft: ServiceDraft;
    set: (patch: Partial<ServiceDraft>) => void;
    /** What is wrong with a row of the hours, once it should be said. */
    hoursProblem: (index: number) => string | null;
    /** A new service whose hours were filled in from the opening hours. */
    startedFromOpening: boolean;
    /** Null when the hours couldn't be read. */
    rules: AvailabilityRule[] | null;
    /** The people on the diary who can take it. */
    people: readonly StaffView[];
    canEdit: boolean;
}) {
    // Asked for by "Give it its own hours": kept open while the page is.
    const [asked, setAsked] = useState(false);
    const from = timesComeFrom(draft.kind, draft.staffIds.length);
    const names = people
        .filter((p) => draft.staffIds.includes(p.id))
        .map((p) => callName(p.name));
    const narrows = from === "people";
    const editor = !narrows || asked || draft.hours.length > 0;

    return (
        <Section title={HOURS_SECTION}>
            {narrows ? (
                <p className={cn(HELP, "mt-0 text-foreground")}>
                    {/* With hours of its own too, both apply: say so. */}
                    Its times come from {whoseHours(names)}
                    {draft.hours.length > 0
                        ? ", inside its own weekly hours below"
                        : ""}
                    .{" "}
                    <TextLink href={AVAILABILITY_HREF}>
                        Change them in Hours and time off
                    </TextLink>
                </p>
            ) : (
                <p className={cn(HELP, "mt-0 text-foreground")}>
                    {draft.kind === "class"
                        ? "A class runs at its own weekly times."
                        : "Nobody takes it yet, so customers book it in its own weekly hours."}
                </p>
            )}
            {rules === null ? (
                <FailedRead
                    className="mt-2.5"
                    things="its weekly hours"
                    reassurance="They can't be changed right now."
                />
            ) : editor ? (
                <div className={narrows ? "mt-3.5" : "mt-2.5"}>
                    {narrows ? (
                        <div className={LABEL}>Its own weekly hours</div>
                    ) : null}
                    <p className={cn(HELP, "mb-2.5", !narrows && "mt-0")}>
                        {hoursNote(draft.timezone, startedFromOpening, narrows)}
                    </p>
                    <HoursField
                        rows={draft.hours}
                        onChange={(hours) => set({ hours })}
                        problemOf={hoursProblem}
                        disabled={!canEdit}
                    />
                </div>
            ) : canEdit ? (
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2.5"
                    onClick={() => setAsked(true)}
                >
                    Give it its own hours
                </Button>
            ) : null}
        </Section>
    );
}
