"use client";

import { Button } from "@saroh/ui/button";
import { Notice } from "@saroh/ui/notice";

import { RadioCards } from "@/components/shared/fields/choice-group";
import { ChevronDown, Plus, Users } from "lucide-react";

import { Face } from "./face";

/** "Everyone" in the picker and the address (`?person=all`). */
export const EVERYONE = "all";

/** A choice row as the boards draw it: 52px, the chosen one edged in Ink. */
export const ROW =
    "min-h-[52px] rounded-[12px] px-3.5 py-2.5 has-[[data-state=checked]]:border-2 has-[[data-state=checked]]:px-[13px] has-[[data-state=checked]]:py-[9px]";

export interface WhoChoice {
    id: string;
    name: string;
    /** What they do ("Physiotherapist"), or the line under Everyone. */
    role: string | null;
}

/**
 * The "Whose hours" card (U17, BKMAvailability, BKDHours): whose week the
 * page shows — their face, name and what they do, and their hours a week —
 * as one button that opens the picker. It replaces a chip per person.
 */
export function WhoseHoursCard({
    name,
    role,
    meta,
    everyone,
    onOpen,
}: {
    name: string;
    role: string | null;
    meta: string;
    everyone: boolean;
    onOpen: () => void;
}) {
    return (
        <button
            type="button"
            aria-haspopup="dialog"
            onClick={onOpen}
            className="flex min-h-[52px] w-full cursor-pointer items-center gap-3 rounded-[12px] border border-border bg-card px-3.5 py-2.5 text-left text-foreground hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-[760px]:w-auto min-[760px]:min-w-[380px] min-[760px]:flex-none"
        >
            {everyone ? (
                <Face icon={<Users aria-hidden className="size-[17px]" />} />
            ) : (
                <Face name={name} />
            )}
            <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] text-muted-foreground">
                    Whose hours
                </span>
                <span className="block truncate text-[14.5px] font-semibold min-[760px]:text-[15px]">
                    {role ? `${name} · ${role}` : name}
                </span>
            </span>
            <span className="shrink-0 text-[12.5px] text-muted-foreground">
                {meta}
            </span>
            <ChevronDown aria-hidden className="size-[18px] shrink-0" />
        </button>
    );
}

/**
 * The picker the card opens: Everyone, then each person who takes
 * bookings, and — for those who may add people — "Add someone who takes
 * bookings" last. Choosing shows their week.
 */
export function WhosePicker({
    choices,
    value,
    canAdd,
    onPick,
    onAdd,
}: {
    choices: WhoChoice[];
    value: string;
    canAdd: boolean;
    onPick: (id: string) => void;
    onAdd: () => void;
}) {
    return (
        <div className="grid gap-2 pb-2">
            <RadioCards
                label="Whose hours"
                value={value}
                onChange={onPick}
                rowClassName={ROW}
                options={choices.map((c) => ({
                    value: c.id,
                    label: (
                        <span className="text-[14.5px] font-semibold">
                            {c.name}
                        </span>
                    ),
                    note: c.role ?? undefined,
                }))}
            />
            {canAdd ? (
                <Button
                    type="button"
                    variant="outline"
                    onClick={onAdd}
                    className="h-auto min-h-[52px] justify-start gap-3 rounded-[12px] border-dashed border-border-strong px-3.5 text-[14.5px] font-semibold"
                >
                    <Plus aria-hidden className="size-[18px]" />
                    Add someone who takes bookings
                </Button>
            ) : null}
        </div>
    );
}

/** What a Member is told, once, beside whose hours (DEC-170, Q13). */
export const MEMBER_LINE =
    "As front desk you can change anyone's hours, time off and extra hours, and your own booking rules. Adding or removing people, closing the whole business and the business's booking rules stay with owners and admins.";

/**
 * The row under the page's header: the Whose hours card and, for a Member,
 * the one line on what they can and can't change — under it on a phone,
 * beside it on a desk.
 */
export function WhoseRow({
    member,
    ...card
}: Parameters<typeof WhoseHoursCard>[0] & { member: boolean }) {
    return (
        <div className="mt-3 flex flex-col gap-2.5 min-[760px]:mb-[18px] min-[760px]:mt-0 min-[760px]:flex-row min-[760px]:flex-wrap min-[760px]:items-center min-[760px]:gap-3">
            <WhoseHoursCard {...card} />
            {member ? (
                <Notice
                    tone="neutral"
                    className="min-[760px]:max-w-[52ch] min-[760px]:border-0 min-[760px]:bg-transparent min-[760px]:p-0 min-[760px]:text-[12.5px] min-[760px]:text-muted-foreground min-[760px]:[&>svg]:hidden"
                >
                    {MEMBER_LINE}
                </Notice>
            ) : null}
        </div>
    );
}
