"use client";

import { count } from "@/lib/format/plural";
import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";
import type { ReactNode } from "react";
import { useState } from "react";

import { pendingAreas } from "@/lib/sites/pending";
import type { Flag, ReviewState, SitePage } from "@/lib/sites/service";
import type { WebAddressFix } from "./address-fix";
import { AddressFix } from "./address-fix";
import {
    APPROVAL_LINE,
    FIX_WORD,
    goesLive,
    oneAreaWords,
    TYPE_LABEL,
} from "./pre-publish-words";

/** Where the business's web address is chosen (Settings › Business, L4). */
export const WEB_ADDRESS_SETTINGS_HREF = "/settings/organization";

/**
 * What the Publish sheet says goes live (DEC-185): one area in a sentence,
 * several as one row each. A never-published site, a missing count and
 * nothing changed keep their sentences (G2).
 */
export function GoingLive({
    neverPublished,
    pendingKnown,
    pendingSummary,
    pendingChanges,
    pendingSiteChanges,
}: {
    neverPublished: boolean;
    pendingKnown: boolean;
    pendingSummary: string | null;
    pendingChanges: number | null;
    pendingSiteChanges: readonly string[] | null;
}) {
    const rows = pendingAreas(pendingChanges, pendingSiteChanges);
    if (neverPublished || !pendingKnown || !pendingSummary || rows.length < 2) {
        return (
            <p className="text-sm" data-going-live="">
                {neverPublished || !pendingKnown || !pendingSummary ? (
                    goesLive(neverPublished, pendingKnown, pendingSummary)
                ) : (
                    <>
                        Going live:{" "}
                        <b className="font-semibold">
                            {oneAreaWords(pendingSummary)}
                        </b>
                        .
                    </>
                )}
            </p>
        );
    }
    return (
        <section aria-label="Going live" data-going-live="">
            <h3 className="label pb-1.5">
                Going live · {count(rows.length, "change")}
            </h3>
            <ul className="divide-y rounded-lg border text-sm">
                {rows.map((row) => (
                    <li key={row.area} className="flex gap-3 px-3 py-2">
                        <span className="w-24 shrink-0 font-medium">
                            {row.area}
                        </span>
                        <span className="min-w-0 text-muted-foreground">
                            {row.detail}
                        </span>
                    </li>
                ))}
            </ul>
        </section>
    );
}

/**
 * The flags (DEC-185), in two parts of the sheet: `blockers`, in red, each
 * with its fix ("Fix first"), above the changes; `advice`, below them,
 * folded ("7 more things worth a look") so it never pushes the changes
 * below the fold. A web address is fixed in place when this person may
 * choose one; any other fix goes to its spot on the page, and the sheet
 * opens again on the same list.
 */
export function PublishFlags({
    part,
    flags,
    pages,
    addressFix,
    fixedHost,
    onAddressSaved,
    onJump,
}: {
    part: "blockers" | "advice";
    flags: Flag[];
    pages: SitePage[];
    addressFix: WebAddressFix | null;
    /** The address chosen here, once saved: "Fixed". */
    fixedHost: string | null;
    onAddressSaved: (host: string) => void;
    onJump: (pageId: string | null, sectionIndex: number | null) => void;
}) {
    const [choosing, setChoosing] = useState(false);
    // A saved address clears its flag before the flags are read again.
    const shown = flags.filter(
        (f) => !(fixedHost && f.type === "addressMissing"),
    );
    const blockers = shown.filter((f) => f.blocking);
    const advice = shown.filter((f) => !f.blocking);
    const where = (flag: Flag) => {
        const page = pages.find((p) => p.id === flag.pageId)?.title;
        if (flag.type === "phoneWidth") {
            return page ? `On a phone · ${page}` : "On a phone";
        }
        return page ?? "This site";
    };

    if (part === "advice") {
        if (shown.length === 0 && !fixedHost) {
            return (
                <p className="text-sm text-muted-foreground">
                    Everything checks out. Publish when you are ready.
                </p>
            );
        }
        if (advice.length === 0) return null;
        return (
            <details data-flag-advice="" className="text-sm">
                <summary className="cursor-pointer font-semibold">
                    {`${count(advice.length, "more thing")} worth a look`}
                </summary>
                <ul className="mt-2 divide-y rounded-lg border">
                    {advice.map((flag, i) => (
                        <FlagRow
                            key={i}
                            tone="advice"
                            title={TYPE_LABEL[flag.type]}
                            line={`${where(flag)} · ${flag.message}`}
                            fix={
                                <FixButton
                                    label={FIX_WORD[flag.type]}
                                    onClick={() =>
                                        onJump(flag.pageId, flag.sectionIndex)
                                    }
                                />
                            }
                        />
                    ))}
                </ul>
                <p className="mt-1.5 text-muted-foreground">
                    {advice.length === 1
                        ? "It won’t stop you publishing."
                        : "None of these stop you publishing."}
                </p>
            </details>
        );
    }

    return (
        <>
            {blockers.length > 0 ? (
                <FlagGroup title={`Fix first · ${blockers.length}`}>
                    {blockers.map((flag, i) => (
                        <FlagRow
                            key={i}
                            tone="block"
                            title={TYPE_LABEL[flag.type]}
                            line={flag.message}
                            fix={
                                flag.type !== "addressMissing" ? (
                                    <FixButton
                                        label={FIX_WORD[flag.type]}
                                        onClick={() =>
                                            onJump(
                                                flag.pageId,
                                                flag.sectionIndex,
                                            )
                                        }
                                    />
                                ) : addressFix?.canChange ? (
                                    choosing ? null : (
                                        <FixButton
                                            label={FIX_WORD.addressMissing}
                                            onClick={() => setChoosing(true)}
                                        />
                                    )
                                ) : (
                                    // Only the owner chooses it, in
                                    // Settings › Business.
                                    <Button
                                        data-ph-unmask=""
                                        asChild
                                        variant="link"
                                        size="sm"
                                        className="h-auto shrink-0 p-0 font-semibold coarse:min-h-11"
                                    >
                                        <Link href={WEB_ADDRESS_SETTINGS_HREF}>
                                            {FIX_WORD.addressMissing}
                                        </Link>
                                    </Button>
                                )
                            }
                        >
                            {flag.type === "addressMissing" &&
                            choosing &&
                            addressFix ? (
                                <AddressFix
                                    fix={addressFix}
                                    onCancel={() => setChoosing(false)}
                                    onSaved={(host) => {
                                        setChoosing(false);
                                        onAddressSaved(host);
                                    }}
                                />
                            ) : null}
                        </FlagRow>
                    ))}
                </FlagGroup>
            ) : null}
            {fixedHost ? (
                <FlagGroup title="Fixed">
                    <FlagRow
                        tone="fixed"
                        title="Web address set"
                        line={fixedHost}
                    />
                </FlagGroup>
            ) : null}
        </>
    );
}

function FlagGroup({
    title,
    children,
}: {
    title: string;
    children: ReactNode;
}) {
    return (
        <section aria-label={title}>
            <h3 className="label pb-1.5">{title}</h3>
            <ul className="divide-y rounded-lg border">{children}</ul>
        </section>
    );
}

function FlagRow({
    tone,
    title,
    line,
    fix,
    children,
}: {
    tone: "block" | "advice" | "fixed";
    title: string;
    line: string;
    fix?: ReactNode;
    children?: ReactNode;
}) {
    return (
        <li data-flag-tone={tone} className="px-3 py-2.5">
            <div className="flex items-start gap-3">
                <span
                    aria-hidden
                    className={cn(
                        "mt-1.5 size-2 shrink-0 rounded-full",
                        tone === "block"
                            ? "bg-destructive"
                            : tone === "fixed"
                              ? "bg-success"
                              : "bg-warning",
                    )}
                />
                <div className="min-w-0 flex-1">
                    <p
                        className={cn(
                            "text-sm font-medium",
                            tone === "block" &&
                                "text-destructive-subtle-foreground",
                        )}
                    >
                        {title}
                    </p>
                    <p className="text-xs leading-snug text-muted-foreground [overflow-wrap:anywhere]">
                        {line}
                    </p>
                </div>
                {fix}
            </div>
            {children}
        </li>
    );
}

function FixButton({ label, onClick }: { label: string; onClick: () => void }) {
    return (
        <Button
            type="button"
            variant="link"
            size="sm"
            onClick={onClick}
            className="h-auto shrink-0 p-0 font-semibold coarse:min-h-11"
        >
            {label}
        </Button>
    );
}

/** The review's latest verdict, a line in the Publish sheet (spec §2). */
export function ApprovalLine({
    review,
    zone,
}: {
    review: ReviewState;
    zone: string;
}) {
    if (!review.latestApproval) return null;
    return (
        <p
            className={
                APPROVAL_LINE[review.latestApproval.outcome].approved
                    ? "rounded-md bg-muted px-3 py-2 text-sm text-foreground"
                    : "rounded-md border px-3 py-2 text-sm text-muted-foreground"
            }
        >
            {APPROVAL_LINE[review.latestApproval.outcome].text(
                review.latestApproval,
                zone,
            )}
            {review.openNotes > 0
                ? `, with ${count(review.openNotes, "note")} still open.`
                : "."}
            {review.outstanding ? (
                <span className="mt-1 block">
                    A reviewer&apos;s request for changes is still open.
                    Publishing now goes ahead without approval, and records that
                    it did, here and in version history.
                </span>
            ) : null}
        </p>
    );
}
