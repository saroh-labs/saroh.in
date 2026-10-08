"use client";

import { cn } from "@saroh/ui/lib/utils";
import { showError } from "@saroh/ui/toast";
import { Info } from "lucide-react";
import Link from "next/link";
import { useOptimistic, useTransition } from "react";

import { useSettingsUndo } from "@/components/organizations/use-settings-undo";
import { saveAlert, undoAlert } from "@/lib/notifications/actions";
import type {
    AlertCell,
    AlertChange,
    AlertKey,
    AlertPreferencesRead,
} from "@/lib/notifications/preferences";
import {
    ALERT_CHANNEL_LABELS,
    alertGrid,
    alertSaved,
    alertUndo,
    withAlert,
} from "@/lib/notifications/preferences";

/** The grid's columns: the alert, then 56px a channel (76px from sm). */
const GRID_COLS: Record<number, string> = {
    1: "grid-cols-[minmax(0,1fr)_repeat(1,56px)] sm:grid-cols-[minmax(0,1fr)_repeat(1,76px)]",
    2: "grid-cols-[minmax(0,1fr)_repeat(2,56px)] sm:grid-cols-[minmax(0,1fr)_repeat(2,76px)]",
    3: "grid-cols-[minmax(0,1fr)_repeat(3,56px)] sm:grid-cols-[minmax(0,1fr)_repeat(3,76px)]",
};

/**
 * "What you hear about" ("Saroh Settings" design, Your profile): each alert
 * by channel, as switches. Only for you — your team picks their own
 * (round-2 F14).
 *
 * A switch saves at once and says so, with Undo for ten seconds (F12's
 * `useSettingsUndo`): Undo saves the switch back, and is refused in words
 * if it has changed since. The switch moves as it is pressed and goes back
 * if the save is refused. What the grid shows otherwise is the server's —
 * the save refreshes the page, so there is no copy of it to drift.
 *
 * Only what can deliver can be switched on (`alertGrid`): a channel with no
 * provider (WhatsApp) is off and fixed, with the line that says why.
 */
export function AlertsGrid({ read }: { read: AlertPreferencesRead }) {
    const [pending, startTransition] = useTransition();
    const [shown, flipShown] = useOptimistic(
        read,
        (current: AlertPreferencesRead, change: AlertChange) =>
            current.status === "ok"
                ? {
                      status: "ok" as const,
                      prefs: withAlert(current.prefs, change),
                  }
                : current,
    );
    const { offer } = useSettingsUndo();
    const grid = alertGrid(shown);
    const cols = GRID_COLS[Math.max(1, grid.columns.length)];

    const flip = (key: AlertKey, cell: AlertCell) => {
        if (cell.disabled || pending) return;
        const change: AlertChange = {
            alert: key,
            channel: cell.channel,
            on: !cell.on,
        };
        startTransition(async () => {
            flipShown(change);
            const result = await saveAlert(change);
            if (!result.ok) {
                showError(result.error, "Your alerts are as they were.");
                return;
            }
            const undo = alertUndo(change);
            offer(alertSaved(change), async () => {
                const back = await undoAlert(undo);
                return back.ok
                    ? { ok: true }
                    : { ok: false, error: back.error };
            });
        });
    };

    return (
        <section
            aria-label="Alerts"
            className="overflow-hidden rounded-xl border border-border bg-card"
        >
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 border-b border-border/70 px-[18px] py-3">
                <h3 className="font-display text-[15px] font-semibold">
                    What you hear about
                </h3>
                <span className="text-[12.5px] text-muted-foreground">
                    Only for you — your team picks their own.
                </span>
            </div>
            {grid.notes.map((note) => (
                <p
                    key={note.id}
                    role="note"
                    className="flex items-start gap-2 text-pretty border-b border-border/70 bg-muted/50 px-[18px] py-2.5 text-[12.5px] text-foreground/80"
                >
                    <Info aria-hidden className="mt-px size-3.5 shrink-0" />
                    <span>
                        {note.text}
                        {note.link ? (
                            <>
                                {" "}
                                <Link
                                    href={note.link.href}
                                    className="wk-press cursor-pointer rounded-sm font-semibold text-foreground underline underline-offset-2 hover:text-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:text-foreground/60"
                                >
                                    {note.link.label}
                                </Link>
                            </>
                        ) : null}
                    </span>
                </p>
            ))}
            {grid.rows.length > 0 ? (
                <div
                    role="table"
                    aria-label="Alerts by channel"
                    aria-busy={pending || undefined}
                    className="text-foreground"
                >
                    <div
                        role="row"
                        className={cn(
                            "grid items-center px-[18px] py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground",
                            cols,
                        )}
                    >
                        {/* In the grid's flow, so the channel headings sit over
                            their switches; only the word is hidden. */}
                        <span role="columnheader">
                            <span className="sr-only">Alert</span>
                        </span>
                        {grid.columns.map((channel) => (
                            <span
                                key={channel}
                                role="columnheader"
                                className="text-center"
                            >
                                {ALERT_CHANNEL_LABELS[channel]}
                            </span>
                        ))}
                    </div>
                    {grid.rows.map((row) => (
                        <div
                            key={row.key}
                            role="row"
                            className={cn(
                                "grid items-center border-t border-border/70 px-[18px] py-2.5",
                                cols,
                            )}
                        >
                            <div role="rowheader" className="min-w-0">
                                <p className="text-[13.5px] font-medium">
                                    {row.label}
                                </p>
                                <p className="text-[11.5px] text-muted-foreground">
                                    {row.note}
                                </p>
                            </div>
                            {row.cells.map((cell) => (
                                <div
                                    key={cell.channel}
                                    role="cell"
                                    className="flex justify-center"
                                >
                                    <AlertSwitch
                                        cell={cell}
                                        busy={pending}
                                        onFlip={() => flip(row.key, cell)}
                                    />
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            ) : null}
        </section>
    );
}

/**
 * The design's 42×24 switch, as Modules draws it: pointer, a soft halo on
 * hover, a deeper one while pressed, and the focus ring. One that can't
 * deliver is fixed off and says why to a screen reader.
 */
function AlertSwitch({
    cell,
    busy,
    onFlip,
}: {
    cell: AlertCell;
    busy: boolean;
    onFlip: () => void;
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={cell.on}
            aria-disabled={cell.disabled || busy || undefined}
            aria-label={cell.label}
            disabled={cell.disabled}
            onClick={onFlip}
            className={cn(
                "wk-press shrink-0 rounded-full p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                cell.disabled
                    ? "cursor-not-allowed opacity-50"
                    : busy
                      ? "cursor-progress"
                      : "cursor-pointer hover:bg-muted active:bg-border",
            )}
        >
            <span
                className={cn(
                    "relative block h-6 w-[42px] rounded-full transition-colors duration-fast",
                    cell.on ? "bg-foreground" : "bg-border",
                )}
            >
                <span
                    className={cn(
                        "absolute top-[3px] size-[18px] rounded-full bg-card transition-[left] duration-fast",
                        cell.on ? "left-[21px]" : "left-[3px]",
                    )}
                />
            </span>
        </button>
    );
}
