"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { Plus, Search } from "lucide-react";
import type { ReactElement } from "react";
import { useState } from "react";

import type { ShowFor } from "@/lib/services/bookings-opens";
import { EVERYONE } from "@/lib/services/bookings-opens";

import { HeaderOverlay } from "./header-overlay";
import { usePhone } from "./use-phone";

/** One choice in Whose bookings: Everyone, or a person on the diary. */
export interface PersonChoice {
    /** A staff id, or `EVERYONE`. */
    key: string;
    name: string;
    initials: string;
    /** What they do ("Physiotherapist"), or how Everyone is drawn. */
    sub: string;
    /** Their live bookings in the view's period. */
    count: number;
}

/**
 * The person's monogram, or Everyone's in Ink: the chip and the sheet's
 * rows draw the same one. Decorative, the name is beside it.
 */
export function PersonFace({
    choice,
    className,
}: {
    choice: Pick<PersonChoice, "key" | "initials">;
    className?: string;
}) {
    return (
        <span
            aria-hidden
            className={cn(
                "grid size-[30px] shrink-0 place-items-center rounded-full text-[11px] font-semibold",
                choice.key === EVERYONE
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground",
                className,
            )}
        >
            {choice.initials}
        </span>
    );
}

/**
 * "Whose bookings?" (U2; BKMBookingsDayPeopleSheet, BKDCalendarDay's person
 * popover): find someone, Everyone, each person with their count for the
 * view's period, and Add someone who takes bookings. Picking one shows
 * their bookings; with "Show bookings for: The last person I picked",
 * Bookings opens on them next time.
 */
export function PeopleSheet({
    open,
    onOpenChange,
    trigger,
    period,
    periodWord,
    choices,
    picked,
    showFor,
    onPick,
    onAdd,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    trigger: ReactElement;
    /** "Mon 19 Oct · today", "19 to 25 Oct · this week". */
    period: string;
    /** After a count: "today", "this week". */
    periodWord: string;
    choices: readonly PersonChoice[];
    picked: string;
    showFor: ShowFor;
    onPick: (key: string) => void;
    /** Add someone who takes bookings, for someone who may. */
    onAdd?: () => void;
}) {
    const phone = usePhone();
    const [find, setFind] = useState("");
    const q = find.trim().toLowerCase();
    const shown = q
        ? choices.filter(
              (c) => c.key !== EVERYONE && c.name.toLowerCase().includes(q),
          )
        : choices;
    return (
        <HeaderOverlay
            open={open}
            onOpenChange={(o) => {
                if (!o) setFind("");
                onOpenChange(o);
            }}
            trigger={trigger}
            title="Whose bookings?"
            subtitle={period}
            width={360}
            footer={
                onAdd ? (
                    <Button
                        variant="outline"
                        className="w-full coarse:h-12"
                        onClick={() => {
                            onOpenChange(false);
                            onAdd();
                        }}
                    >
                        <Plus aria-hidden className="mr-1.5 size-4" />
                        Add someone who takes bookings
                    </Button>
                ) : undefined
            }
        >
            <div className="grid gap-1 max-[759px]:gap-2 max-[759px]:pb-3">
                <div className="relative mb-1">
                    <Search
                        aria-hidden
                        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                        type="search"
                        value={find}
                        onChange={(e) => setFind(e.target.value)}
                        placeholder="Find someone"
                        aria-label="Find someone"
                        className="h-10 pl-9 max-[759px]:h-11 max-[759px]:text-[15px]"
                    />
                </div>
                <div
                    role="radiogroup"
                    aria-label="Whose bookings"
                    className="grid gap-1 max-[759px]:gap-2"
                >
                    {shown.map((c) => {
                        const on = c.key === picked;
                        return (
                            <button
                                key={c.key}
                                type="button"
                                role="radio"
                                aria-checked={on}
                                onClick={() => onPick(c.key)}
                                className={cn(
                                    "flex min-h-[50px] w-full cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-1.5 text-left text-foreground transition-colors duration-fast hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                    "max-[759px]:min-h-16 max-[759px]:gap-3 max-[759px]:rounded-[12px] max-[759px]:border max-[759px]:border-border max-[759px]:bg-card max-[759px]:px-3 max-[759px]:py-2",
                                    on &&
                                        "bg-muted shadow-[inset_0_0_0_1.5px_hsl(var(--foreground))] max-[759px]:border-2 max-[759px]:border-foreground max-[759px]:px-[11px] max-[759px]:py-[7px] max-[759px]:shadow-none",
                                )}
                            >
                                <PersonFace
                                    choice={c}
                                    className="max-[759px]:size-9 max-[759px]:text-[12.5px]"
                                />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[14px] font-semibold max-[759px]:text-[14.5px]">
                                        {c.name}
                                    </span>
                                    <span className="mt-0.5 block truncate text-[12.5px] text-muted-foreground">
                                        {c.key === EVERYONE && !phone
                                            ? "A column for each person"
                                            : c.sub}
                                    </span>
                                </span>
                                <span className="text-right tabular-nums">
                                    <span className="block text-[14px] font-semibold">
                                        {c.count}
                                    </span>
                                    <span className="block text-[11px] text-muted-foreground max-[759px]:text-[11.5px]">
                                        {c.count === 1 ? "booking" : "bookings"}{" "}
                                        {periodWord}
                                    </span>
                                </span>
                            </button>
                        );
                    })}
                    {shown.length === 0 ? (
                        <p className="px-1 py-2 text-[13px] text-muted-foreground">
                            Nobody by that name takes bookings.
                        </p>
                    ) : null}
                </div>
                <p className="mx-1 mt-1.5 text-[12.5px] leading-normal text-muted-foreground max-[759px]:mx-0 max-[759px]:mt-1">
                    {showFor === "last"
                        ? "Bookings remembers who you pick here and opens on them next time. Change it under ⋯ › Show bookings for."
                        : showFor === "all"
                          ? "Bookings opens on everyone’s bookings for you. Change it under ⋯ › Show bookings for."
                          : "Bookings opens on your own bookings for you. Change it under ⋯ › Show bookings for."}
                </p>
            </div>
        </HeaderOverlay>
    );
}
