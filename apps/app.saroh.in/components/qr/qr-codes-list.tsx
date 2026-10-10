"use client";

import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import { cn } from "@saroh/ui/lib/utils";
import { QrCode } from "lucide-react";

import type { QrCodeView } from "@/lib/qr/types";
import {
    linkWords,
    MADE_NOTE,
    madeWords,
    opensWords,
    placeWords,
} from "@/lib/qr/words";

const HEAD =
    "text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground";

/** A cell's name: said to a screen reader at the desk, shown on a phone. */
function CellName({ children }: { children: React.ReactNode }) {
    return <span className={cn(HEAD, "min-[760px]:sr-only")}>{children}</span>;
}

/**
 * "Your QR codes" ("Saroh QR Codes" design): Placed at · Opens · Scans ·
 * Bookings · Change, on a white card with ruled rows.
 *
 * One list, drawn two ways with CSS alone: a five-column row from 760px,
 * and below it a card per code with each value named, so nothing scrolls
 * sideways on a phone (the design's table has a 620px floor).
 *
 * - The counts are the plan's (`included`): without them the two columns
 *   are left out, never drawn as zeros.
 * - A code whose page is gone says so, and where its paper goes now.
 * - Retired codes sit in a quiet group of their own, with no controls:
 *   a retired code can't be changed.
 * - Without `canChange` a row offers only View.
 */
export function QrCodesList({
    codes,
    included,
    canChange,
    activeId,
    onChange,
    onView,
    onRetire,
}: {
    codes: readonly QrCodeView[];
    included: boolean;
    canChange: boolean;
    /** The code the maker or the viewer holds now. */
    activeId: string | null;
    onChange: (code: QrCodeView) => void;
    onView: (code: QrCodeView) => void;
    onRetire: (code: QrCodeView) => void;
}) {
    const active = codes.filter((c) => !c.retired);
    const retired = codes.filter((c) => c.retired);
    const columns = included
        ? "min-[760px]:grid-cols-[1.2fr_1.4fr_80px_90px_auto]"
        : "min-[760px]:grid-cols-[1.2fr_1.4fr_auto]";
    const row = cn(
        "grid gap-x-3 gap-y-2 px-4 py-3 min-[760px]:items-center",
        columns,
    );

    if (codes.length === 0) {
        return (
            <EmptyState
                icon={<QrCode />}
                title="No QR codes yet"
                description={
                    canChange
                        ? "Choose what a code opens and where it goes, then make it. It is listed here with its scans."
                        : "An owner or admin makes them. They are listed here once there are some."
                }
            />
        );
    }

    return (
        <div className="flex flex-col gap-3">
            {active.length > 0 ? (
                <div className="rounded-[14px] border border-border bg-card text-sm">
                    <div
                        aria-hidden
                        className={cn(
                            row,
                            HEAD,
                            "hidden border-b border-muted py-2.5 min-[760px]:grid",
                        )}
                    >
                        <span>Placed at</span>
                        <span>Opens</span>
                        {included ? (
                            <>
                                <span>Scans</span>
                                <span>Bookings</span>
                            </>
                        ) : null}
                        <span />
                    </div>
                    <ul aria-label="Your QR codes">
                        {active.map((code) => {
                            const made = madeWords(code);
                            const on = code.id === activeId;
                            return (
                                <li
                                    key={code.id}
                                    data-qr-row={code.code}
                                    aria-current={on ? "true" : undefined}
                                    className={cn(
                                        row,
                                        "border-b border-muted last:border-b-0",
                                        on && "bg-muted/60",
                                    )}
                                >
                                    <div className="flex min-w-0 flex-col gap-0.5">
                                        <CellName>Placed at</CellName>
                                        <span className="font-semibold [overflow-wrap:anywhere]">
                                            {placeWords(code)}
                                        </span>
                                        {code.link ? (
                                            <span className="font-mono text-[11.5px] text-muted-foreground [overflow-wrap:anywhere]">
                                                {linkWords(code.link)}
                                            </span>
                                        ) : null}
                                    </div>
                                    <div className="flex min-w-0 flex-col gap-0.5">
                                        <CellName>Opens</CellName>
                                        <span
                                            data-qr-opens={
                                                code.target.missing
                                                    ? "gone"
                                                    : "ok"
                                            }
                                            className="text-foreground/80 [overflow-wrap:anywhere]"
                                        >
                                            {opensWords(code)}
                                        </span>
                                    </div>
                                    {included ? (
                                        <>
                                            <div className="flex flex-col gap-0.5">
                                                <CellName>Scans</CellName>
                                                <span
                                                    data-qr-scans=""
                                                    className="font-mono tabular-nums"
                                                >
                                                    {code.scans.total}
                                                </span>
                                                {code.scans.last7Days > 0 ? (
                                                    <span className="text-[11.5px] text-muted-foreground">
                                                        {code.scans.last7Days}{" "}
                                                        this week
                                                    </span>
                                                ) : null}
                                            </div>
                                            <div className="flex flex-col gap-0.5">
                                                <CellName>Bookings</CellName>
                                                <span
                                                    data-qr-bookings=""
                                                    className="font-mono tabular-nums"
                                                >
                                                    {made.bookings}
                                                </span>
                                                {made.orders ? (
                                                    <span className="text-[11.5px] text-muted-foreground">
                                                        {made.orders}
                                                    </span>
                                                ) : null}
                                            </div>
                                        </>
                                    ) : null}
                                    <div className="flex flex-wrap items-center gap-1 min-[760px]:justify-end">
                                        {canChange ? (
                                            <>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-[13px] text-brand"
                                                    aria-label={`Change the ${placeWords(code)} code`}
                                                    onClick={() =>
                                                        onChange(code)
                                                    }
                                                >
                                                    Change
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-[13px]"
                                                    aria-label={`Retire the ${placeWords(code)} code`}
                                                    onClick={() =>
                                                        onRetire(code)
                                                    }
                                                >
                                                    Retire
                                                </Button>
                                            </>
                                        ) : (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="text-[13px] text-brand"
                                                aria-label={`View the ${placeWords(code)} code`}
                                                onClick={() => onView(code)}
                                            >
                                                View
                                            </Button>
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            ) : null}
            {included && active.length > 0 ? (
                <p className="text-[13px] text-muted-foreground">{MADE_NOTE}</p>
            ) : null}

            {retired.length > 0 ? (
                <section
                    aria-label="Retired codes"
                    className="mt-1 flex flex-col gap-1.5"
                >
                    <h5 className={HEAD}>Retired</h5>
                    <p className="text-[13px] text-muted-foreground">
                        A printed copy of one of these opens your home page.
                    </p>
                    <ul className="rounded-[14px] border border-border text-[13px] text-muted-foreground">
                        {retired.map((code) => (
                            <li
                                key={code.id}
                                data-qr-retired={code.code}
                                className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-border px-4 py-2.5 last:border-b-0"
                            >
                                <span className="font-semibold [overflow-wrap:anywhere]">
                                    {placeWords(code)}
                                </span>
                                <span className="[overflow-wrap:anywhere]">
                                    opened {opensWords(code)}
                                </span>
                                {included ? (
                                    <span className="font-mono tabular-nums">
                                        {code.scans.total}{" "}
                                        {code.scans.total === 1
                                            ? "scan"
                                            : "scans"}
                                    </span>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}
        </div>
    );
}
