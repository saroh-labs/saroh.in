"use client";

import { Button } from "@saroh/ui/button";
import { IconButton } from "@saroh/ui/icon-button";
import { cn } from "@saroh/ui/lib/utils";
import { ProgressBar, doneOf } from "@saroh/ui/progress-bar";
import { TextLink, textLinkClass } from "@saroh/ui/text-link";
import { showUndo } from "@saroh/ui/toast";
import { Check, ChevronRight, X } from "lucide-react";
import Link from "next/link";
import type { ComponentPropsWithRef } from "react";
import { useId, useState } from "react";

import { useCanChangePlan } from "@/components/billing/plan-way";
import { PlanAsides, readyRows } from "@/components/settings/ready-rows";
import { SetupChecklist } from "@/components/shared/setup-checklist/setup-checklist";
import { count as countOf } from "@/lib/format/plural";
import type { ReadyChecklist } from "@/lib/settings/ready";
import { checklistWords, takeMoneyPlace } from "@/lib/settings/ready";
import type { ChecklistRow } from "@/lib/setup-checklist";
import { countRows, orderRows } from "@/lib/setup-checklist";

import {
    setSetupHidden,
    useSetupHidden,
} from "@/components/home/setup/use-setup-hidden";
import { HomeSheet } from "./home-sheet";

/** Said with Undo: on a phone, Settings is the way back (A4). */
export const PHONE_HIDE_SAID =
    "Setup hidden. Show it again from Settings › Business.";

/**
 * Finish setup on a phone (DEC-171, plan U17, A4, boards `HPHome`,
 * `HPMore` "setup", `HPStates` "getting set up"):
 *
 * - while fewer than half the steps are done, a card at the top: the
 *   count and bar, the next step with its one button, and "See all 4
 *   steps", which opens the setup sheet;
 * - once more are done, one dashed line at the foot naming the next step,
 *   which opens the sheet, with an × that hides it for now (Undo);
 * - the sheet is the one checklist (`SetupChecklist`), every step with its
 *   button and Hide for now;
 * - hidden, nothing on Home: Settings › Business's "Show setup on Home"
 *   brings it back. Finished, the shared card above both layouts says so.
 *
 * Hide is per person, per business, in this browser, the same store the
 * desk reads (`use-setup-hidden.ts`), so hiding on one hides on both.
 */
export function PhoneSetup({
    list,
    businessId,
    slot,
}: {
    list: ReadyChecklist;
    businessId: string;
    /** Home draws it twice: the card at the top, the line at the foot. */
    slot: "first" | "late";
}) {
    const hidden = useSetupHidden(businessId);
    const canChangePlan = useCanChangePlan();
    const [open, setOpen] = useState(false);
    const headingId = useId();
    const place = takeMoneyPlace(list, hidden);
    if (place !== slot) return null;

    const words = checklistWords(list);
    const rows = readyRows(list.steps, canChangePlan);
    const { done, total } = countRows(rows);
    const next = orderRows(rows).find((r) => !r.done) ?? null;
    const hide = () => {
        setOpen(false);
        setSetupHidden(businessId, true);
        showUndo(PHONE_HIDE_SAID, () => setSetupHidden(businessId, false));
    };

    const sheetProps = {
        name: "setup",
        open,
        onOpenChange: setOpen,
        title: words.title,
        foot: (
            <TextLink
                tone="muted"
                onClick={hide}
                className="text-[12.5px] coarse:min-h-11"
            >
                Hide for now
            </TextLink>
        ),
        children: (
            <SetupChecklist
                name="home-phone"
                {...words}
                rows={rows}
                hide={{
                    hidden: false,
                    // Its own Hide for now says so with Undo itself.
                    onHide: () => {
                        setOpen(false);
                        setSetupHidden(businessId, true);
                    },
                    onShow: () => setSetupHidden(businessId, false),
                    said: PHONE_HIDE_SAID,
                }}
            >
                <PlanAsides items={list.outside} />
            </SetupChecklist>
        ),
    } as const;

    if (place === "first") {
        return (
            <section
                data-phone-setup="card"
                aria-labelledby={headingId}
                className="grid gap-2.5 rounded-[14px] border border-border bg-card p-4"
            >
                <h2
                    id={headingId}
                    data-ph-unmask=""
                    className="text-base font-semibold"
                >
                    {words.title}
                </h2>
                <ProgressBar
                    value={done}
                    max={total}
                    label={doneOf(done, total)}
                />
                <p className="text-pretty text-[13.5px] leading-normal text-neutral-700 dark:text-muted-foreground">
                    {doneOf(done, total)}
                    {next ? ` · next: ${lowerFirst(next.label)}` : ""}
                    {next?.why ? `. ${next.why}` : ""}
                </p>
                {next?.action ? <NextAction row={next} /> : null}
                <HomeSheet
                    {...sheetProps}
                    trigger={<SeeAllSteps total={total} />}
                />
            </section>
        );
    }

    return (
        <div
            data-phone-setup="line"
            className="flex min-h-12 items-center gap-1.5 rounded-xl border border-dashed border-border-strong pl-3.5 pr-1"
        >
            <HomeSheet
                {...sheetProps}
                trigger={<SetupLineButton next={next} title={words.title} />}
            />
            <IconButton
                label="Hide setup for now"
                tooltip={false}
                onClick={hide}
                icon={<X />}
                className="size-11 shrink-0 text-muted-foreground"
            />
        </div>
    );
}

function lowerFirst(text: string): string {
    return text.charAt(0).toLowerCase() + text.slice(1);
}

/** The next step's one button, full width, as the card draws it. */
function NextAction({ row }: { row: ChecklistRow }) {
    const action = row.action;
    if (!action) return null;
    if (action.href) {
        return (
            <Button asChild className="w-full">
                <Link href={action.href}>{action.label}</Link>
            </Button>
        );
    }
    return (
        <Button type="button" className="w-full" onClick={action.onPress}>
            {action.label}
        </Button>
    );
}

/** "Finish setup: choose where your online shop sells from". */
function SetupLineButton({
    next,
    title,
    className,
    ...props
}: {
    next: ChecklistRow | null;
    title: string;
} & ComponentPropsWithRef<"button">) {
    return (
        <button
            type="button"
            data-phone-setup-line=""
            {...props}
            className={cn(
                "flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg border-0 bg-transparent p-0 text-left text-[13.5px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                className,
            )}
        >
            <Check aria-hidden className="size-4 shrink-0" />
            <span className="min-w-0 [overflow-wrap:anywhere]">
                {next ? `${title}: ${lowerFirst(next.label)}` : title}
            </span>
        </button>
    );
}

/** "See all 4 steps": reads as a link, opens the setup sheet. */
function SeeAllSteps({
    total,
    className,
    ...props
}: { total: number } & ComponentPropsWithRef<"button">) {
    return (
        <button
            type="button"
            {...props}
            className={cn(
                textLinkClass(),
                "justify-self-start text-[13.5px] coarse:min-h-11",
                className,
            )}
        >
            See all {countOf(total, "step")}
            <ChevronRight aria-hidden className="size-4" />
        </button>
    );
}
