"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { showError } from "@saroh/ui/toast";
import Link from "next/link";
import { useState } from "react";

import type {
    ChangeRow,
    ChargeRow,
    CollectionRow,
} from "@/lib/subscriptions/view";

import { Pill } from "../pill";

const CARD = "rounded-xl border border-border bg-card";
const TITLE = "font-display text-[15px] font-semibold tracking-[-0.02em]";
const EYEBROW =
    "text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground";

/** Next collections, each with Skip — or Undo skip — while it is running. */
export function CollectionsCard({
    rows,
    what,
    hint,
    canWrite,
    busyDate,
    onToggle,
}: {
    rows: CollectionRow[];
    /** What is collected: "1 sourdough loaf". */
    what: string | null;
    hint: string;
    canWrite: boolean;
    busyDate: string | null;
    onToggle: (row: CollectionRow) => void;
}) {
    return (
        <section
            aria-labelledby="collections-title"
            className={cn(CARD, "px-4 pb-1.5 pt-[13px]")}
        >
            <div className="mb-1 flex flex-wrap items-baseline gap-2">
                <h2 id="collections-title" className={cn(TITLE, "flex-1")}>
                    Next collections
                </h2>
                <span className="text-[12px] text-muted-foreground">
                    {hint}
                </span>
            </div>
            {rows.map((u) => (
                <div
                    key={u.date}
                    className={cn(
                        "flex items-center gap-2.5 border-t border-border/70 py-[9px]",
                        u.state === "Paused" && "text-muted-foreground",
                    )}
                >
                    {/* Side by side from sm up, as the design; stacked on a
                        phone, where the note would wrap a word to a line. */}
                    <span className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-2.5">
                        <span className="block text-[13px] font-semibold sm:w-24 sm:shrink-0">
                            {u.label}
                        </span>
                        {what ? (
                            <span className="block min-w-0 text-[12.5px] text-muted-foreground sm:flex-1">
                                {what}
                            </span>
                        ) : null}
                    </span>
                    <Pill tone={u.tone}>{u.state}</Pill>
                    {canWrite && u.canSkip ? (
                        <button
                            type="button"
                            onClick={() => onToggle(u)}
                            disabled={busyDate === u.date}
                            aria-label={`${u.skipped ? "Undo skip" : "Skip"} ${u.label}`}
                            className="h-8 min-w-[76px] rounded-[8px] border border-border bg-card px-3 text-[12px] font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:bg-disabled disabled:text-disabled-foreground coarse:h-11"
                        >
                            {u.skipped ? "Undo skip" : "Skip"}
                        </button>
                    ) : null}
                </div>
            ))}
        </section>
    );
}

/** How many charges show before "Show all" — a weekly plan makes 52 a year. */
const FIRST_CHARGES = 8;

/** Every charge, newest first, each linking to its invoice. */
export function ChargesCard({
    state,
    rows: all,
    footer,
}: {
    state: "ok" | "denied" | "failed";
    rows: ChargeRow[];
    footer: string;
}) {
    const [everything, setEverything] = useState(false);
    const rows = everything ? all : all.slice(0, FIRST_CHARGES);
    return (
        <section
            aria-labelledby="charges-title"
            className={cn(CARD, "overflow-hidden")}
        >
            <h2
                id="charges-title"
                className={cn(TITLE, "px-4 pb-1.5 pt-[13px]")}
            >
                Charges
            </h2>
            {state !== "ok" ? (
                <p
                    role={state === "failed" ? "alert" : "note"}
                    className="border-t border-border/70 px-4 py-2.5 text-[12.5px] text-muted-foreground"
                >
                    {state === "denied"
                        ? "Your role can't see invoices, so the charges aren't shown here."
                        : "The charges couldn't be loaded. Everything else on this page is up to date."}
                </p>
            ) : rows.length === 0 ? (
                <p className="border-t border-border/70 px-4 py-2.5 text-[12.5px] text-muted-foreground">
                    Nothing charged yet.
                </p>
            ) : (
                rows.map((c) => (
                    <div
                        key={c.id}
                        className="flex flex-wrap items-baseline gap-2.5 border-t border-border/70 px-4 py-[9px]"
                    >
                        <span className="w-16 shrink-0 text-[12.5px] text-muted-foreground">
                            {c.date}
                        </span>
                        <Pill tone={c.tone}>{c.result}</Pill>
                        <span className="min-w-0 flex-[1_1_140px] text-[12.5px] text-muted-foreground">
                            {c.note}
                        </span>
                        <span className="font-semibold tabular-nums">
                            {c.amount}
                        </span>
                        {c.number ? (
                            <Link
                                href={`/billing/invoices/${c.id}`}
                                className="font-mono text-[11.5px] text-brand hover:text-foreground"
                            >
                                {c.number}
                            </Link>
                        ) : null}
                    </div>
                ))
            )}
            {state === "ok" && all.length > rows.length ? (
                <div className="border-t border-border/70 px-4 py-2">
                    <button
                        type="button"
                        onClick={() => setEverything(true)}
                        className="text-[12.5px] font-semibold text-brand hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:min-h-11"
                    >
                        Show all {all.length} charges
                    </button>
                </div>
            ) : null}
            {footer ? (
                <p className="border-t border-border/70 px-4 pb-3 pt-[9px] text-[11.5px] text-muted-foreground">
                    {footer}
                </p>
            ) : null}
        </section>
    );
}

export function CustomerCard({
    contactId,
    name,
    initials,
    reach,
    allergy,
}: {
    contactId: string;
    name: string;
    initials: string;
    reach: string;
    allergy: string | null;
}) {
    return (
        <section aria-label="Customer" className={cn(CARD, "px-4 py-[13px]")}>
            <div className="flex items-center gap-2.5">
                <span
                    aria-hidden
                    className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-muted text-[12px] font-bold"
                >
                    {initials}
                </span>
                <div className="min-w-0">
                    <Link
                        href={`/customers/${contactId}`}
                        className="text-[14px] font-semibold text-foreground hover:underline"
                    >
                        {name}
                    </Link>
                    <div className="break-words text-[12px] text-muted-foreground">
                        {reach}
                    </div>
                </div>
            </div>
            {allergy ? (
                <p className="mt-2.5 rounded-[8px] bg-destructive-subtle px-2.5 py-2 text-[12.5px] font-semibold text-destructive-subtle-foreground">
                    {allergy}
                </p>
            ) : null}
        </section>
    );
}

export function PlanCard({
    name,
    what,
    price,
    older,
    paysBy,
}: {
    name: string;
    what: string | null;
    price: string;
    older: string | null;
    paysBy: string;
}) {
    return (
        <section aria-label="Plan" className={cn(CARD, "px-4 py-[13px]")}>
            <div className={cn(EYEBROW, "mb-1.5")}>Plan</div>
            <div className="text-[14px] font-semibold">{name}</div>
            {what ? (
                <div className="mt-0.5 text-[12.5px] text-muted-foreground">
                    {what}
                </div>
            ) : null}
            <div className="mt-2 text-[13.5px] font-semibold tabular-nums">
                {price}
            </div>
            {older ? (
                <div className="mt-[3px] text-[12px] text-brand">{older}</div>
            ) : null}
            <div className="mt-2 text-[12px] text-muted-foreground">
                {paysBy}
            </div>
        </section>
    );
}

export function ChangesCard({ rows }: { rows: ChangeRow[] }) {
    return (
        <section
            aria-labelledby="changes-title"
            className={cn(CARD, "px-4 py-[13px]")}
        >
            <h2 id="changes-title" className={cn(TITLE, "mb-2")}>
                Changes
            </h2>
            {rows.map((c, i) => (
                <div key={i} className="py-1.5">
                    <div className="text-[13px] font-semibold">{c.what}</div>
                    <div className="text-[12px] text-muted-foreground">
                        {c.when}
                    </div>
                </div>
            ))}
        </section>
    );
}

/** A failed charge's new pay link, shown once: the API keeps only its hash. */
export function PayLinkRow({ url, name }: { url: string; name: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <span className="min-w-0 flex-[1_1_220px] truncate rounded-[8px] border border-border bg-card px-2.5 py-1.5 font-mono text-[12px]">
                {url}
            </span>
            <Button
                variant="outline"
                className="h-8 rounded-[8px] px-3 text-[12.5px] font-semibold coarse:h-11"
                onClick={() => {
                    void navigator.clipboard.writeText(url).then(
                        () => setCopied(true),
                        () =>
                            showError(
                                "Couldn't copy it — select the link and copy it by hand.",
                            ),
                    );
                }}
            >
                {copied ? "Copied" : "Copy link"}
            </Button>
            <span className="basis-full text-[12px] text-muted-foreground">
                Send it to {name} yourself — Saroh doesn&apos;t send it. It
                works until it&apos;s paid or you make another.
            </span>
        </div>
    );
}
