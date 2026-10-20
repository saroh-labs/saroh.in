"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { TextLink } from "@saroh/ui/text-link";
import { showUndo } from "@saroh/ui/toast";
import { Check, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useId } from "react";

import { FACT_DOT } from "@/lib/format/join";
import type { ChecklistRow } from "@/lib/setup-checklist";

/*
 * The rows of the one setup checklist (`setup-checklist.tsx`), shared by its
 * card and its one-line form on Home (`setup-line.tsx`).
 */

/** One step of a setup checklist: ticked, or left with its one button. */
export function ChecklistStep({ row }: { row: ChecklistRow }) {
    // A button says what it does ("Add address"). Which step it is for is
    // its description, so two "Write" buttons are told apart.
    const labelId = useId();
    if (row.done) {
        return (
            <li
                data-step={row.key}
                data-done=""
                className="flex min-h-8 flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-muted-foreground"
            >
                <Check
                    aria-hidden
                    className="size-4 shrink-0 text-success-subtle-foreground"
                />
                <span className="min-w-0 [overflow-wrap:anywhere]">
                    <span className="sr-only">Done: </span>
                    {row.label}
                    {row.note ? `${FACT_DOT}${row.note}` : null}
                </span>
                {row.view ? <ViewLink view={row.view} /> : null}
            </li>
        );
    }
    const { action } = row;
    return (
        <li
            data-step={row.key}
            className="flex min-h-9 flex-wrap items-center gap-x-2.5 gap-y-1.5 py-1 text-[13px]"
        >
            <span
                aria-hidden
                className={cn(
                    "size-4 shrink-0 rounded-full border-[1.5px]",
                    row.broken ? "border-destructive" : "border-border-strong",
                )}
            />
            <span className="grid min-w-0 flex-[1_1_200px] gap-px">
                <span
                    id={labelId}
                    className="font-medium [overflow-wrap:anywhere]"
                >
                    <span className="sr-only">
                        {row.broken ? "Needs fixing: " : "To do: "}
                    </span>
                    {row.label}
                </span>
                {row.why ? (
                    <span className="text-pretty text-[12.5px] leading-[1.45] text-muted-foreground">
                        {row.why}
                    </span>
                ) : null}
            </span>
            {action ? (
                action.href ? (
                    <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                    >
                        <Link
                            href={action.href}
                            aria-describedby={labelId}
                            // With a press of its own, the link is the
                            // address for a page whose script has not
                            // arrived: the press does it in place.
                            onClick={
                                action.onPress
                                    ? (e) => {
                                          e.preventDefault();
                                          action.onPress?.();
                                      }
                                    : undefined
                            }
                        >
                            {action.label}
                        </Link>
                    </Button>
                ) : (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={action.onPress}
                        aria-describedby={labelId}
                        className="shrink-0"
                    >
                        {action.label}
                    </Button>
                )
            ) : null}
        </li>
    );
}

/** "Your online shop ↗": the live page, in a new tab. */
export function ViewLink({ view }: { view: { label: string; href: string } }) {
    return (
        <a
            href={view.href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-6 items-center gap-0.5 rounded-sm text-[12.5px] font-medium text-foreground underline decoration-muted-foreground/40 underline-offset-4 hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:text-muted-foreground coarse:min-h-11"
        >
            {view.label}
            <ExternalLink aria-hidden className="size-3.5" />
            <span className="sr-only">(opens in a new tab)</span>
        </a>
    );
}

/**
 * "Hide for now", with Undo: a quiet link, as the Home boards draw it
 * (`HAGettingSetUpD`, `HAPageD`). Only Home offers it.
 */
export function HideForNow({
    hide,
    className,
}: {
    hide: { onHide: () => void; onShow: () => void; said: string };
    className?: string;
}) {
    return (
        <TextLink
            tone="muted"
            onClick={() => {
                hide.onHide();
                // The card coming back is its own answer.
                showUndo(hide.said, () => {
                    hide.onShow();
                });
            }}
            className={cn("text-[12.5px] coarse:min-h-11", className)}
        >
            Hide for now
        </TextLink>
    );
}
