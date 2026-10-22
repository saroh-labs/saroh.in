import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { FailedState } from "@saroh/ui/data-state";
import {
    couldntLoad,
    nothingChanged,
    planLabel,
} from "@saroh/ui/lib/state-copy";
import { cn } from "@saroh/ui/lib/utils";
import { TextLink } from "@saroh/ui/text-link";
import { CalendarClock, Check } from "lucide-react";
import Link from "next/link";

import { ViewerDate } from "@/components/shared/dates/viewer-date";
import type { PickerRow } from "@/lib/saroh-billing/plan-view";

import { RefreshButton } from "./refresh-button";
import { PLANS_HREF, card } from "./styles";

/**
 * The plan the business is on, and only that one (owner, 14 Oct 2026):
 * its name, its price, who it's for and every line it includes, with one
 * button to the next screen, where all the plans are ("Change plan"; on a
 * plan that costs nothing, "See plans"). A change that already waits is
 * said here too ("Your plan from ‹date›: ‹plan›"), without listing the
 * other plans.
 *
 * Without `billing:manage` there is no button: a quiet link opens the same
 * next screen to read.
 */
export function CurrentPlanCard({
    row,
    coming,
    canChange,
}: {
    /** The current plan's card; null when Saroh's price list couldn't be read. */
    row: PickerRow | null;
    /** A change that waits for its date: the plan it moves to. */
    coming: { name: string; iso: string } | null;
    /** `billing:manage`: who may change the plan. */
    canChange: boolean;
}) {
    if (row === null) {
        return (
            <FailedState
                size="panel"
                title={couldntLoad("Saroh's plans")}
                description={nothingChanged("Your plan is as it was.")}
                action={<RefreshButton />}
                className={card}
            />
        );
    }
    const way = canChange ? (
        <Button asChild className="max-desk:w-full">
            <Link href={PLANS_HREF}>
                {row.amount === "₹0" ? planLabel() : "Change plan"}
            </Link>
        </Button>
    ) : (
        <TextLink href={PLANS_HREF} className="text-[13px]">
            See Saroh&apos;s plans
        </TextLink>
    );
    return (
        <section
            aria-label="Current plan"
            className={cn(
                card,
                "grid gap-x-8 gap-y-4 p-[18px] desk:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]",
            )}
        >
            <div className="grid content-start justify-items-start">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <h3 className="font-display text-[16px] font-semibold">
                        {row.name}
                    </h3>
                    <Badge size="sm">Current plan</Badge>
                </div>
                <p className="mt-3 flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
                    <span className="font-display text-[32px] font-semibold tabular-nums leading-none tracking-[-0.02em]">
                        {row.amount}
                    </span>
                    {row.per ? (
                        <span className="text-[13px] text-foreground/80">
                            {row.per}
                        </span>
                    ) : null}
                </p>
                {row.what ? (
                    <p className="mt-2.5 text-pretty text-[13.5px] text-foreground/80">
                        {row.what}
                    </p>
                ) : null}
                {row.note ? (
                    <p className="mt-1.5 text-[13.5px] font-semibold">
                        {row.note.lead}
                        {row.note.iso ? (
                            <ViewerDate iso={row.note.iso} />
                        ) : null}
                        {row.note.tail}
                    </p>
                ) : null}
                {coming ? (
                    <p className="mt-3 flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-[13.5px] font-semibold">
                        <CalendarClock
                            aria-hidden
                            className="mt-0.5 size-4 shrink-0"
                        />
                        <span>
                            Your plan from <ViewerDate iso={coming.iso} />:{" "}
                            {coming.name}
                        </span>
                    </p>
                ) : null}
                <div className="mt-4 max-desk:w-full">{way}</div>
            </div>
            {row.lines.length > 0 ? (
                <div className="border-t border-border/70 pt-4 desk:border-l desk:border-t-0 desk:pl-8 desk:pt-0">
                    <ul
                        aria-label={`What ${row.name} gives you`}
                        className="grid gap-x-6 gap-y-1.5 text-[13px] text-foreground/80 sm:grid-cols-2"
                    >
                        {row.lead ? (
                            <li className="font-medium text-foreground sm:col-span-2">
                                {row.lead}
                            </li>
                        ) : null}
                        {row.lines.map((l) => (
                            <li key={l} className="flex items-start gap-2">
                                <Check
                                    aria-hidden
                                    className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                                />
                                {l}
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}
        </section>
    );
}
