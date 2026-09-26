import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { Info } from "lucide-react";

import type { AlertCell, AlertRow } from "@/lib/notifications/preferences";
import {
    ALERT_CHANNEL_LABELS,
    ALERT_CHANNELS,
} from "@/lib/notifications/preferences";

/**
 * Settings → Your profile ("Saroh Settings" design): you, and what you hear
 * about. Two cards, 760px at most.
 *
 * "You" reads your Saroh account. Your name, email and password belong to
 * accounts.saroh.in — the same in every business you are in — so each
 * "Change" goes there rather than editing here. The design's "Two-step
 * sign-in" row is left out: Saroh has no two-step sign-in to turn on.
 *
 * "What you hear about" is the design's grid of alerts by channel. Nothing
 * stores those choices yet (`lib/notifications/preferences.ts`), so the
 * switches are drawn off and disabled, with a line that says why.
 */
export function YourProfile({
    name,
    email,
    accountUrl,
    alerts,
    alertsSaved,
}: {
    name: string;
    email: string;
    /** Your account on accounts.saroh.in. */
    accountUrl: string;
    alerts: AlertRow[];
    /** False until the API keeps alert choices. */
    alertsSaved: boolean;
}) {
    const rows: {
        label: string;
        value: string;
        empty?: string;
        change?: string;
    }[] = [
        { label: "Name", value: name, empty: "Not set", change: "Change" },
        { label: "Email", value: email },
        {
            label: "Password",
            value: "Kept with your Saroh account",
            change: "Change",
        },
    ];

    return (
        <div className="grid max-w-[760px] gap-4">
            <section
                aria-label="You"
                className="overflow-hidden rounded-xl border border-border bg-card"
            >
                <dl>
                    {rows.map((row, i) => (
                        <div
                            key={row.label}
                            className={cn(
                                "grid grid-cols-[minmax(110px,170px)_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-[18px] py-[11px]",
                                i > 0 && "border-t border-border/70",
                            )}
                        >
                            <dt className="text-[13px] text-muted-foreground">
                                {row.label}
                            </dt>
                            <dd
                                className={cn(
                                    "text-[13.5px] [overflow-wrap:anywhere]",
                                    !row.value && "text-muted-foreground",
                                )}
                            >
                                {row.value || row.empty}
                            </dd>
                            {row.change ? (
                                <Button asChild variant="outline" size="sm">
                                    {/* Cross-origin: accounts.saroh.in owns identity. */}
                                    <a
                                        href={accountUrl}
                                        aria-label={`${row.change} your ${row.label.toLowerCase()} on your Saroh account`}
                                    >
                                        {row.change}
                                    </a>
                                </Button>
                            ) : (
                                <span />
                            )}
                        </div>
                    ))}
                </dl>
                <p className="text-pretty border-t border-border/70 bg-muted/50 px-[18px] py-3 text-[12.5px] text-foreground/80">
                    These are your Saroh account&apos;s, the same in every
                    business you belong to. They&apos;re changed on
                    accounts.saroh.in.
                </p>
            </section>

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
                {alertsSaved ? null : (
                    <p
                        role="note"
                        className="flex items-start gap-2 border-b border-border/70 bg-muted/50 px-[18px] py-2.5 text-[12.5px] text-foreground/80"
                    >
                        <Info aria-hidden className="mt-px size-3.5 shrink-0" />
                        Choosing your alerts isn&apos;t switched on yet, so
                        these can&apos;t be changed or saved.
                    </p>
                )}
                <div
                    role="table"
                    aria-label="Alerts by channel"
                    className="text-foreground"
                >
                    <div
                        role="row"
                        className="grid grid-cols-[minmax(0,1fr)_repeat(3,56px)] items-center px-[18px] py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground sm:grid-cols-[minmax(0,1fr)_repeat(3,76px)]"
                    >
                        {/* In the grid's flow, so the channel headings sit over
                            their switches; only the word is hidden. */}
                        <span role="columnheader">
                            <span className="sr-only">Alert</span>
                        </span>
                        {ALERT_CHANNELS.map((channel) => (
                            <span
                                key={channel}
                                role="columnheader"
                                className="text-center"
                            >
                                {ALERT_CHANNEL_LABELS[channel]}
                            </span>
                        ))}
                    </div>
                    {alerts.map((alert) => (
                        <div
                            key={alert.key}
                            role="row"
                            className="grid grid-cols-[minmax(0,1fr)_repeat(3,56px)] items-center border-t border-border/70 px-[18px] py-2.5 sm:grid-cols-[minmax(0,1fr)_repeat(3,76px)]"
                        >
                            <div role="rowheader" className="min-w-0">
                                <p className="text-[13.5px] font-medium">
                                    {alert.label}
                                </p>
                                <p className="text-[11.5px] text-muted-foreground">
                                    {alert.note}
                                </p>
                            </div>
                            {alert.cells.map((cell) => (
                                <div
                                    key={cell.channel}
                                    role="cell"
                                    className="flex justify-center"
                                >
                                    <AlertSwitch cell={cell} />
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}

/**
 * The design's 42×24 switch, as Modules draws it. Display only for now: it
 * takes a handler when the API can save the choice.
 */
function AlertSwitch({ cell }: { cell: AlertCell }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={cell.on}
            aria-disabled={cell.disabled}
            aria-label={cell.label}
            disabled={cell.disabled}
            className={cn(
                "shrink-0 rounded-full p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                cell.disabled
                    ? "cursor-not-allowed opacity-50"
                    : "cursor-pointer",
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
