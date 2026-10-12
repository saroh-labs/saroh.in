"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";

import { TimezoneSelect } from "@/components/shared/timezone-select";
import type { AvailabilityRule } from "@/lib/services/service";
import { hoursNote } from "@/lib/services/service-editor";

import { FailedRead } from "@/components/shared/failed-read";
import { Field } from "@saroh/ui/field";
import type { Edit } from "./fields";
import { HELP, LABEL, NumberField, Section } from "./fields";
import { GstFields } from "./gst-fields";
import { HoursField } from "./hours-field";

/**
 * More settings (E2, default 42): what the old service forms had that the
 * design's page leaves out, kept one click away (00-universal §15) — the
 * time zone, the buffer before, GST, the service's own weekly hours and
 * Delete. Closed until opened (UX-056: `hidden` alone lost to `grid`).
 *
 * GST left for the Price section where the business is GST-registered
 * (12 Oct 2026): a rate that has to be chosen is asked where the price is.
 */
export function MoreSettings({
    draft,
    set,
    problem,
    leave,
    hoursProblem,
    startedFromOpening,
    forceOpen,
    serviceId,
    rules,
    canEdit,
    withGst = true,
    onDelete,
}: Edit & {
    /**
     * The GST rate and SAC code are drawn here (`gstPlace`): not for a
     * registered business, whose rate is asked beside the price, nor for
     * one that isn't registered and never saved one.
     */
    withGst?: boolean;
    /** What is wrong with a row of the hours, once it should be said. */
    hoursProblem: (index: number) => string | null;
    /** A new service whose hours were filled in from the opening hours. */
    startedFromOpening: boolean;
    /** Opened by the page: something in here has to be fixed. */
    forceOpen: boolean;
    /** Null while creating: Delete needs a saved service. */
    serviceId: string | null;
    /** Null when the hours couldn't be read. */
    rules: AvailabilityRule[] | null;
    canEdit: boolean;
    onDelete: () => void;
}) {
    const [opened, setOpen] = useState(false);
    const open = opened || forceOpen;
    const ids = { body: useId() };
    return (
        <Section title="More settings">
            <p className={cn(HELP, "mt-0")}>
                {withGst
                    ? "Time zone, buffer before, GST, its own weekly hours, and deleting it."
                    : "Time zone, buffer before, its own weekly hours, and deleting it."}
            </p>
            <Button
                size="sm"
                type="button"
                variant="outline"
                aria-expanded={open}
                aria-controls={ids.body}
                onClick={() => setOpen(!open)}
                className="mt-2.5"
            >
                {open ? "Hide more settings" : "Show more settings"}
                <ChevronDown
                    aria-hidden
                    className={open ? "size-4 rotate-180" : "size-4"}
                />
            </Button>
            <div
                id={ids.body}
                hidden={!open}
                className={cn("mt-3.5 gap-4", open ? "grid" : "hidden")}
            >
                <div className="flex flex-wrap gap-3">
                    <Field
                        label="Time zone"
                        className="flex-[1_1_220px]"
                        error={problem("timezone")}
                    >
                        <TimezoneSelect
                            value={draft.timezone}
                            onValueChange={(timezone) => set({ timezone })}
                            disabled={!canEdit}
                        />
                    </Field>
                    <NumberField
                        label="Buffer before (min)"
                        value={draft.bufferBefore}
                        onChange={(bufferBefore) => set({ bufferBefore })}
                        width="w-[120px]"
                        error={problem("bufferBefore")}
                        onLeave={() => leave("bufferBefore")}
                    />
                </div>
                {withGst ? (
                    <div className="flex flex-wrap gap-3">
                        <GstFields
                            draft={draft}
                            set={set}
                            problem={problem}
                            leave={leave}
                            asked={false}
                            canEdit={canEdit}
                        />
                    </div>
                ) : null}
                <div>
                    <div className={LABEL}>Its own weekly hours</div>
                    {rules === null ? (
                        <FailedRead
                            things="its weekly hours"
                            reassurance="They can't be changed right now."
                        />
                    ) : (
                        <>
                            <p className={cn(HELP, "mb-2.5")}>
                                {hoursNote(draft.timezone, startedFromOpening)}
                            </p>
                            <HoursField
                                rows={draft.hours}
                                onChange={(hours) => set({ hours })}
                                problemOf={hoursProblem}
                                disabled={!canEdit}
                            />
                        </>
                    )}
                </div>
                {serviceId !== null && canEdit ? (
                    <div className="border-t border-border pt-3.5">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onDelete}
                            className="text-destructive hover:text-destructive"
                        >
                            Delete service
                        </Button>
                        <p className={HELP}>
                            To stop bookings for now, use Stop taking bookings
                            instead. Delete can&apos;t be undone.
                        </p>
                    </div>
                ) : null}
            </div>
        </Section>
    );
}
