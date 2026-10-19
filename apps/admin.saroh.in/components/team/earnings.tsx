import { Badge } from "@saroh/ui/badge";

import { formatPaise } from "@/lib/billing-words";
import type { EarningsSummary } from "@/lib/commission-words";
import {
    KIND_LABEL,
    LINE_STATUS_LABEL,
    monthLabel,
    partLabel,
    rateLabel,
} from "@/lib/commission-words";
import { formatDate } from "@/lib/format";

export interface EarningsCardProps {
    /** One teammate's earnings (`readEarnings(platformAdminId)` in `lib/commission.ts`). */
    earnings: EarningsSummary;
}

/**
 * A teammate's earnings (DEC-169, admin console U21), for the Earnings tab
 * of their page (U22): what is earned but not payable yet, what is due and
 * what has been paid, each month's statement with its reference, and
 * their latest payments. Read-only, and shown only with `team:pay`: the
 * page leaves it out otherwise, and the API refuses regardless. Marking a
 * month paid is on the Payouts tab.
 */
export function EarningsCard({ earnings }: EarningsCardProps) {
    const { totals } = earnings;
    const notes = [
        totals.held > 0
            ? `${totals.held} held until the billing provider's amount is checked`
            : null,
        totals.noRate > 0
            ? `${totals.noRate} waiting for a commission rate to be set`
            : null,
    ].filter((n): n is string => n !== null);

    return (
        <section aria-labelledby="earnings-heading" className="grid gap-4">
            <div className="flex flex-wrap items-center gap-2">
                <h2 id="earnings-heading" className="text-base font-semibold">
                    Earnings
                </h2>
                {!earnings.onCommission ? (
                    <Badge variant="outline" size="sm">
                        Not on commission
                    </Badge>
                ) : null}
            </div>

            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Figure
                    label="Earned, not yet payable"
                    paise={totals.pendingPaise}
                />
                <Figure label="Due" paise={totals.duePaise} />
                <Figure label="Paid" paise={totals.paidPaise} />
            </dl>
            {notes.length > 0 ? (
                <p className="text-sm text-muted-foreground">
                    Also: {notes.join("; ")}.
                </p>
            ) : null}

            <div className="grid gap-2">
                <h3 className="text-sm font-medium">Statements</h3>
                {earnings.months.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        Nothing has been payable yet.
                    </p>
                ) : (
                    <ul className="grid gap-1.5">
                        {earnings.months.map((m) => (
                            <li
                                key={m.month}
                                className="flex flex-wrap items-center justify-between gap-2 text-sm"
                            >
                                <span>{monthLabel(m.month)}</span>
                                <span className="flex items-center gap-2 tabular-nums">
                                    {formatPaise(m.amountPaise)}
                                    {m.paid ? (
                                        <Badge variant="success" size="sm">
                                            Paid
                                        </Badge>
                                    ) : (
                                        <Badge variant="warning" size="sm">
                                            Due
                                        </Badge>
                                    )}
                                    {m.reference ? (
                                        <span className="font-mono text-[13px] text-muted-foreground">
                                            {m.reference}
                                        </span>
                                    ) : null}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <div className="grid gap-2">
                <h3 className="text-sm font-medium">Latest payments</h3>
                {earnings.recent.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        None of their businesses has paid Saroh yet.
                    </p>
                ) : (
                    <ul className="grid gap-1.5">
                        {earnings.recent.map((line) => (
                            <li
                                key={line.id}
                                className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 text-sm"
                            >
                                <span>
                                    {line.businessName}
                                    {partLabel(line) ? (
                                        <span className="text-muted-foreground">
                                            {" "}
                                            · month {partLabel(line)}
                                        </span>
                                    ) : null}
                                    <span className="block text-[13px] text-muted-foreground">
                                        {KIND_LABEL[line.kind]} · period ends{" "}
                                        {formatDate(line.periodEnd)}
                                    </span>
                                </span>
                                <span className="text-right tabular-nums">
                                    {line.amountPaise === null
                                        ? "—"
                                        : formatPaise(line.amountPaise)}
                                    <span className="block text-[13px] text-muted-foreground">
                                        {rateLabel(line.basisPoints)} ·{" "}
                                        {LINE_STATUS_LABEL[line.status]}
                                    </span>
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </section>
    );
}

function Figure({ label, paise }: { label: string; paise: number }) {
    return (
        <div className="rounded-md border bg-card p-3">
            <dt className="text-[13px] text-muted-foreground">{label}</dt>
            <dd className="text-lg font-semibold tabular-nums">
                {formatPaise(paise)}
            </dd>
        </div>
    );
}
