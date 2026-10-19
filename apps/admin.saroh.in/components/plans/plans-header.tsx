"use client";

import { formatCount } from "@saroh/pricing-catalog";
import { Button } from "@saroh/ui/button";
import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";

import { formatDate } from "@/lib/format";
import { publishedByName, upcomingVersions } from "@/lib/pricing-draft";

import { useDraft } from "./draft-store";
import { usePlans } from "./plans-context";
import { usePlansNav } from "./plans-nav";
import { usePreview } from "./preview/preview-state";

/**
 * The page's heading (admin redesign U13, R18): "Plans and modules", one
 * status line under it, and the previews' buttons beside it. The page draws
 * the bare heading at once (`PlansHeader`); once the catalogue is read the
 * shell draws it again with its line and buttons (`PlansLiveHeader`).
 */
export function PlansHeader({
    line,
    hint,
    actions,
}: {
    line?: ReactNode;
    hint?: ReactNode;
    actions?: ReactNode;
}) {
    return (
        <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <div className="grid min-w-0 flex-[1_1_320px] gap-1">
                <h1 className="font-display text-[22px] font-semibold tracking-[-0.01em]">
                    Plans and modules
                </h1>
                {line && (
                    <p className="text-[13px] text-muted-foreground">{line}</p>
                )}
                {hint && (
                    <p className="text-[12.5px] text-muted-foreground">
                        {hint}
                    </p>
                )}
            </div>
            {actions && (
                <div className="flex flex-wrap items-center gap-2">
                    {actions}
                </div>
            )}
        </header>
    );
}

const HEAD_BUTTON = "h-[34px] rounded-[9px] px-3.5 text-[13px]";

/**
 * What is live, in one line: the version, when and by whom, how many
 * businesses are on it, anything still to go live, which version an edit
 * starts from when that isn't the live one, and a read-only reader's
 * "can't change it". What the draft changes is the draft bar's to say.
 */
export function statusLine(input: {
    live: {
        version: number;
        goLiveAt: string;
        businesses: number;
        by: string;
    } | null;
    next: { version: number; goLiveAt: string; waiting: boolean } | null;
    baseVersion: number | null;
    canEdit: boolean;
}): string {
    const { live, next } = input;
    const parts: string[] = [];
    if (live) {
        parts.push(
            `Live: version ${live.version}, published ${formatDate(live.goLiveAt)} by ${live.by}`,
        );
        parts.push(
            live.businesses === 1
                ? `1 business on version ${live.version}`
                : `${formatCount(live.businesses)} businesses on version ${live.version}`,
        );
    } else {
        parts.push("Nothing is published yet");
    }
    if (next) {
        parts.push(
            next.waiting
                ? `Version ${next.version} is waiting for billing`
                : `Version ${next.version} goes live ${formatDate(next.goLiveAt)}`,
        );
    }
    if (input.baseVersion !== null && input.baseVersion !== live?.version) {
        parts.push(`You edit from version ${input.baseVersion}`);
    }
    if (!input.canEdit)
        parts.push("You can see pricing here but not change it");
    return parts.join(" · ");
}

export function PlansLiveHeader() {
    const { pricing, access } = usePlans();
    const { live, base, hasDraft, catalog } = useDraft();
    const { tab } = usePlansNav();
    const preview = usePreview();
    const next = upcomingVersions(pricing).at(0) ?? null;

    const line = statusLine({
        live: live
            ? {
                  version: live.version,
                  goLiveAt: live.goLiveAt,
                  businesses: live.businesses,
                  by: publishedByName(live),
              }
            : null,
        next: next
            ? {
                  version: next.version,
                  goLiveAt: next.goLiveAt,
                  waiting: next.status === "waiting",
              }
            : null,
        baseVersion: base?.version ?? null,
        canEdit: access.canEdit,
    });

    return (
        <PlansHeader
            line={line}
            hint={
                !hasDraft && access.canEdit && catalog
                    ? "Edits make a shared draft. Businesses see nothing until you publish."
                    : undefined
            }
            actions={
                catalog ? (
                    <>
                        {tab === "plans" && (
                            <Button
                                type="button"
                                variant="ghost"
                                className={HEAD_BUTTON}
                                aria-pressed={preview.shown}
                                onClick={() => preview.setShown(!preview.shown)}
                            >
                                {preview.shown
                                    ? "Hide preview"
                                    : "Show preview"}
                            </Button>
                        )}
                        {hasDraft && (
                            <Button
                                type="button"
                                variant="outline"
                                className={HEAD_BUTTON}
                                onClick={() => void preview.openFull()}
                                disabled={preview.opening}
                            >
                                {preview.opening
                                    ? "Opening…"
                                    : "Full page preview"}
                                <ArrowUpRight
                                    aria-hidden
                                    className="size-3.5"
                                />
                                <span className="sr-only">
                                    {" "}
                                    (opens in a new tab)
                                </span>
                            </Button>
                        )}
                    </>
                ) : undefined
            }
        />
    );
}
