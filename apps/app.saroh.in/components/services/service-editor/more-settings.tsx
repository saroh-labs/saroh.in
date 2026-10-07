"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";

import { AvailabilityRulesEditor } from "@/components/bookings/availability-rules-editor";
import { OptionSelect } from "@/components/shared/option-select";
import { TimezoneSelect } from "@/components/shared/timezone-select";
import type { GstRateValue } from "@/lib/invoices/gst";
import { GST_RATE_OPTIONS } from "@/lib/invoices/gst";
import type { AvailabilityRule } from "@/lib/services/service";
import type { ServiceDraft } from "@/lib/services/service-editor";

import { FIELD, HELP, LABEL, NumberField, Section } from "./fields";

/**
 * More settings (E2, default 42): what the old service forms had that the
 * design's page leaves out, kept one click away (00-universal §15) — the
 * time zone, the buffer before, GST, the service's own weekly hours and
 * Delete. Closed until opened (UX-056: `hidden` alone lost to `grid`).
 */
export function MoreSettings({
    draft,
    set,
    serviceId,
    rules,
    canEdit,
    onDelete,
}: {
    draft: ServiceDraft;
    set: (patch: Partial<ServiceDraft>) => void;
    /** Null while creating: hours and Delete need a saved service. */
    serviceId: string | null;
    /** Null when the hours couldn't be read. */
    rules: AvailabilityRule[] | null;
    canEdit: boolean;
    onDelete: () => void;
}) {
    const [open, setOpen] = useState(false);
    const ids = {
        body: useId(),
        tz: useId(),
        gst: useId(),
        sac: useId(),
    };
    return (
        <Section title="More settings">
            <p className={cn(HELP, "mt-0")}>
                Time zone, buffer before, GST, its own weekly hours, and
                deleting it.
            </p>
            <Button
                type="button"
                variant="outline"
                aria-expanded={open}
                aria-controls={ids.body}
                onClick={() => setOpen((o) => !o)}
                className="mt-2.5 h-8 rounded-[8px] px-3 text-[13px]"
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
                    <div className="min-w-0 flex-[1_1_220px]">
                        <label htmlFor={ids.tz} className={LABEL}>
                            Time zone
                        </label>
                        <div className="mt-[5px]">
                            <TimezoneSelect
                                id={ids.tz}
                                value={draft.timezone}
                                onValueChange={(timezone) => set({ timezone })}
                                disabled={!canEdit}
                            />
                        </div>
                    </div>
                    <NumberField
                        label="Buffer before (min)"
                        value={draft.bufferBefore}
                        onChange={(bufferBefore) => set({ bufferBefore })}
                        width="w-[120px]"
                    />
                </div>
                <div className="flex flex-wrap gap-3">
                    <div className="min-w-0 flex-[1_1_200px]">
                        <label htmlFor={ids.gst} className={LABEL}>
                            GST rate
                        </label>
                        <div className="mt-[5px]">
                            <OptionSelect
                                id={ids.gst}
                                value={draft.gstRate as GstRateValue}
                                onValueChange={(gstRate) => set({ gstRate })}
                                options={GST_RATE_OPTIONS}
                                disabled={!canEdit}
                            />
                        </div>
                        <p className={HELP}>
                            Included in the price, on a GST invoice.
                        </p>
                    </div>
                    <div className="min-w-0 flex-[1_1_160px]">
                        <label htmlFor={ids.sac} className={LABEL}>
                            SAC code
                        </label>
                        <Input
                            id={ids.sac}
                            inputMode="numeric"
                            maxLength={10}
                            placeholder="999723"
                            value={draft.sacCode}
                            onChange={(e) => set({ sacCode: e.target.value })}
                            className={cn(FIELD, "font-mono")}
                        />
                        <p className={HELP}>
                            The service code printed on tax invoices.
                        </p>
                    </div>
                </div>
                <div>
                    <div className={LABEL}>Its own weekly hours</div>
                    {serviceId === null ? (
                        <p className={HELP}>
                            Set once it&apos;s added. With people on the diary,
                            it books in their free time instead.
                        </p>
                    ) : rules === null ? (
                        <p role="alert" className={HELP}>
                            Its weekly hours couldn&apos;t be loaded, so they
                            can&apos;t be changed right now. Nothing has changed
                            — reload to try again.
                        </p>
                    ) : (
                        <>
                            <p className={cn(HELP, "mb-2.5")}>
                                Weekly windows in {draft.timezone}. They save on
                                their own, with Save availability.
                            </p>
                            <AvailabilityRulesEditor
                                serviceId={serviceId}
                                initialRules={rules}
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
                            className="h-[38px] rounded-[9px] px-4 text-[14px] text-destructive hover:text-destructive"
                        >
                            Delete service
                        </Button>
                        <p className={HELP}>
                            To stop bookings for now, use Stop taking bookings
                            instead — Delete can&apos;t be undone.
                        </p>
                    </div>
                ) : null}
            </div>
        </Section>
    );
}
