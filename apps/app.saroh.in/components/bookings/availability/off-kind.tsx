"use client";

import { cn } from "@saroh/ui/lib/utils";
import { Store, UserRound } from "lucide-react";
import type { ReactNode } from "react";

import { RadioCards } from "@/components/shared/fields/choice-group";

/** A kind of time off: its sign over its few words. */
function KindLabel({
    icon,
    title,
    amber = false,
}: {
    icon: ReactNode;
    title: string;
    amber?: boolean;
}) {
    return (
        <span className="grid gap-2">
            <span
                className={cn(
                    "grid size-9 place-items-center rounded-[10px]",
                    amber
                        ? "bg-warning-subtle text-warning-subtle-foreground"
                        : "bg-muted text-foreground",
                )}
            >
                {icon}
            </span>
            <span className="text-[14.5px] font-semibold leading-snug">
                {title}
            </span>
        </span>
    );
}

/**
 * What kind of time off (BKMHoursV2TimeOff): someone is away, or the
 * business is closed. Offered only to those who may close the business.
 */
export function OffKind({
    value,
    onChange,
}: {
    value: "person" | "business";
    onChange: (kind: "person" | "business") => void;
}) {
    return (
        <RadioCards
            label="What kind of time off"
            value={value}
            onChange={onChange}
            className="grid-cols-2"
            rowClassName="min-h-[112px] items-start rounded-[12px] p-3 has-[[data-state=checked]]:border-2 has-[[data-state=checked]]:p-[11px]"
            options={[
                {
                    value: "person",
                    label: (
                        <KindLabel
                            icon={
                                <UserRound
                                    aria-hidden
                                    className="size-[18px]"
                                />
                            }
                            title="Someone is away"
                        />
                    ),
                    note: "Leave, a course, a doctor's visit",
                },
                {
                    value: "business",
                    label: (
                        <KindLabel
                            amber
                            icon={<Store aria-hidden className="size-[18px]" />}
                            title="The business is closed"
                        />
                    ),
                    note: "A holiday. Nobody can be booked.",
                },
            ]}
        />
    );
}
