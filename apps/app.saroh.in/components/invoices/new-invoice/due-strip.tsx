"use client";

import { ViewerDate } from "@/components/shared/dates/viewer-date";
import { ChipGroup } from "@/components/shared/fields/choice-group";
import type { InvoiceFormValues } from "@/lib/invoices/new-invoice";
import { DUES, dueFrom } from "@/lib/invoices/new-invoice";

/**
 * Due (INVNewA): On receipt, 7, 14 or 30 days, or the draft's own date when
 * it has one. The chosen chip says the day it lands on ("14 days · 2 Nov"),
 * in the business's zone, as the paper prints it.
 */
export function DueStrip({
    value,
    onChange,
    draftDueAt,
    zone,
    now,
}: {
    value: InvoiceFormValues["due"];
    onChange: (next: InvoiceFormValues["due"]) => void;
    /** The draft's own due date, offered as a chip of its own. */
    draftDueAt: string | null;
    zone: string;
    now: Date;
}) {
    return (
        <ChipGroup
            label="Due"
            className="items-center"
            value={String(value)}
            onChange={(v) => onChange(v === "kept" ? "kept" : Number(v))}
            choices={[
                ...(draftDueAt
                    ? [
                          {
                              value: "kept",
                              label: (
                                  <ViewerDate
                                      iso={draftDueAt}
                                      variant="dayMonth"
                                      timeZone={zone}
                                  />
                              ),
                          },
                      ]
                    : []),
                ...DUES.map((d) => ({
                    value: String(d.days),
                    label:
                        value === d.days && d.days > 0 ? (
                            <>
                                {d.label} ·{" "}
                                <ViewerDate
                                    iso={dueFrom(d.days, now, zone)}
                                    variant="dayMonth"
                                    timeZone={zone}
                                />
                            </>
                        ) : (
                            d.label
                        ),
                })),
            ]}
        />
    );
}
