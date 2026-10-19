"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { showError, showSuccess } from "@saroh/ui/toast";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { OperatorDialog } from "@/components/operator-dialog";
import { formatPaise } from "@/lib/billing-words";
import {
    exportPayoutsAction,
    markPayoutPaidAction,
} from "@/lib/commission-actions";
import type {
    PayoutRow,
    PayoutStatement,
    RatesView,
} from "@/lib/commission-words";
import {
    evidenceFacts,
    KIND_LABEL,
    LINE_STATUS_LABEL,
    markPaidProblem,
    monthLabel,
    partLabel,
    rateLabel,
    sourceWords,
    stepMonth,
    waitingWords,
} from "@/lib/commission-words";
import { formatDate } from "@/lib/format";

import { RatesSheet } from "./rates-sheet";

export interface PayoutsTabProps {
    /** The month's statement (`readPayouts(month)` in `lib/commission.ts`). */
    statement: PayoutStatement;
    /** The viewer holds `team:pay`: Mark paid and Export are theirs. */
    canMarkPaid: boolean;
    /** The viewer's own teammate id: nobody marks their own commission paid. */
    viewerPlatformAdminId: string | null;
    /**
     * The rates (`readRates()`), only for a holder of `commission:rates`;
     * with them the tab offers Commission rates….
     */
    rates?: RatesView | null;
    /** The address the month steps link to; `?month=` is added. Default: here. */
    basePath?: string;
}

/**
 * The Team page's Payouts tab (DEC-169, admin console U21): one month's
 * statement for everyone on commission. Each row says what the month owes
 * them (Due) or paid them (Paid, with the reference), what they have
 * earned that isn't payable yet, and the businesses they brought in that
 * month with how each was proved, for review. Mark paid… is an
 * `OperatorDialog` asking the payment's reference; it locks the month. A
 * month is moved through with ‹ › links (`?month=`); Export saves the
 * month's CSV. Shown only with `team:pay`: the page leaves the tab out
 * otherwise, and the API refuses regardless.
 */
export function PayoutsTab({
    statement,
    canMarkPaid,
    viewerPlatformAdminId,
    rates,
    basePath = "",
}: PayoutsTabProps) {
    const router = useRouter();
    const [ratesOpen, setRatesOpen] = useState(false);
    const [exporting, startExport] = useTransition();
    const { month, totals } = statement;
    const monthHref = (m: string) => `${basePath}?month=${m}`;

    function exportCsv() {
        startExport(async () => {
            const result = await exportPayoutsAction(month);
            if (!result.ok) {
                showError(result.error);
                return;
            }
            const url = URL.createObjectURL(
                new Blob([result.data.csv], { type: "text/csv" }),
            );
            const a = document.createElement("a");
            a.href = url;
            a.download = result.data.filename;
            a.click();
            URL.revokeObjectURL(url);
        });
    }

    return (
        <section aria-labelledby="payouts-heading" className="grid gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1">
                    <Button asChild size="icon" variant="ghost">
                        <Link
                            href={monthHref(stepMonth(month, -1))}
                            aria-label="Previous month"
                            title="Previous month"
                        >
                            <ChevronLeft className="size-4" aria-hidden />
                        </Link>
                    </Button>
                    <h2
                        id="payouts-heading"
                        className="min-w-36 text-center text-base font-semibold"
                    >
                        {monthLabel(month)}
                    </h2>
                    <Button asChild size="icon" variant="ghost">
                        <Link
                            href={monthHref(stepMonth(month, 1))}
                            aria-label="Next month"
                            title="Next month"
                        >
                            <ChevronRight className="size-4" aria-hidden />
                        </Link>
                    </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                    {rates ? (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setRatesOpen(true)}
                        >
                            Commission rates…
                        </Button>
                    ) : null}
                    {canMarkPaid ? (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={exporting}
                            onClick={exportCsv}
                        >
                            {exporting ? "Exporting…" : "Export CSV"}
                        </Button>
                    ) : null}
                </div>
            </div>

            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Total
                    label="Due this month"
                    value={formatPaise(totals.duePaise)}
                />
                <Total
                    label="Paid this month"
                    value={formatPaise(totals.paidPaise)}
                />
                <Total
                    label="Earned, not yet payable"
                    value={formatPaise(totals.waitingPaise)}
                />
            </dl>
            <p className="text-sm text-muted-foreground">
                A payment becomes payable once the period it pays for ends with
                no refund or dispute, and is paid at the end of that month.
            </p>

            {statement.people.length === 0 ? (
                <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    Nobody is paid by commission yet.
                </p>
            ) : (
                <ul className="grid gap-3">
                    {statement.people.map((row) => (
                        <PersonRow
                            key={row.platformAdminId}
                            row={row}
                            month={month}
                            problem={markPaidProblem(row, {
                                platformAdminId: viewerPlatformAdminId,
                                canPay: canMarkPaid,
                            })}
                            canMarkPaid={canMarkPaid}
                            onPaid={(message) => {
                                showSuccess(message);
                                router.refresh();
                            }}
                        />
                    ))}
                </ul>
            )}

            {rates && ratesOpen ? (
                <RatesSheet
                    rates={rates}
                    open={ratesOpen}
                    onOpenChange={setRatesOpen}
                    onSaved={() => router.refresh()}
                />
            ) : null}
        </section>
    );
}

function Total({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-md border bg-card p-3">
            <dt className="text-[13px] text-muted-foreground">{label}</dt>
            <dd className="text-lg font-semibold tabular-nums">{value}</dd>
        </div>
    );
}

function PersonRow({
    row,
    month,
    problem,
    canMarkPaid,
    onPaid,
}: {
    row: PayoutRow;
    month: string;
    problem: string | null;
    canMarkPaid: boolean;
    onPaid: (message: string) => void;
}) {
    const waiting = waitingWords(row.waiting);
    return (
        <li
            className="rounded-md border bg-card p-4"
            data-testid={`payout-${row.platformAdminId}`}
        >
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="grid gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{row.name}</span>
                        {row.status === "DUE" ? (
                            <Badge variant="warning" size="sm">
                                Due
                            </Badge>
                        ) : row.status === "PAID" ? (
                            <Badge variant="success" size="sm">
                                Paid
                            </Badge>
                        ) : null}
                        {!row.onCommission ? (
                            <Badge variant="outline" size="sm">
                                Not on commission
                            </Badge>
                        ) : null}
                    </div>
                    <div className="text-sm text-muted-foreground">
                        {row.lineCount > 0
                            ? `${formatPaise(row.amountPaise)} for ${row.lineCount} ${row.lineCount === 1 ? "payment" : "payments"}`
                            : "Nothing for this month"}
                    </div>
                    {row.payout ? (
                        <div className="text-sm text-muted-foreground">
                            Paid {formatDate(row.payout.paidAt)} by{" "}
                            {row.payout.paidByName} · Reference{" "}
                            <span className="font-mono">
                                {row.payout.reference}
                            </span>
                        </div>
                    ) : null}
                    {waiting ? (
                        <div className="text-sm text-muted-foreground">
                            Not yet payable:{" "}
                            {formatPaise(row.waiting.amountPaise)} from{" "}
                            {waiting}
                        </div>
                    ) : null}
                </div>
                {row.status === "DUE" && canMarkPaid ? (
                    <MarkPaid
                        row={row}
                        month={month}
                        problem={problem}
                        onPaid={onPaid}
                    />
                ) : null}
            </div>

            {row.newBusinesses.length > 0 ? (
                <div className="mt-3 grid gap-2">
                    <h3 className="text-sm font-medium">
                        Brought in this month ({row.newBusinesses.length})
                    </h3>
                    <ul className="grid gap-2">
                        {row.newBusinesses.map((b) => (
                            <li key={b.organizationId} className="text-sm">
                                <Link
                                    href={`/businesses/${b.organizationId}`}
                                    className="font-medium underline-offset-4 hover:underline"
                                >
                                    {b.name}
                                </Link>{" "}
                                <span className="text-muted-foreground">
                                    · {sourceWords(b.source)} on{" "}
                                    {formatDate(b.startedAt)}
                                    {b.ended ? " · link ended since" : ""}
                                </span>
                                {evidenceFacts(b.evidence).length > 0 ? (
                                    <span className="block text-[13px] text-muted-foreground">
                                        {evidenceFacts(b.evidence)
                                            .map(
                                                (f) =>
                                                    `${f.label}: ${f.label === "Code" || f.label === "Lead" ? f.value : formatDate(f.value)}`,
                                            )
                                            .join(" · ")}
                                    </span>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}

            {row.lines.length > 0 ? (
                <details className="mt-3">
                    <summary className="cursor-pointer text-sm font-medium coarse:min-h-11">
                        Payments in this statement
                    </summary>
                    <ul className="mt-2 grid gap-1.5">
                        {row.lines.map((line) => (
                            <li
                                key={line.id}
                                className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 text-sm"
                            >
                                <span>
                                    {line.businessName}
                                    {line.invoiceNumber ? (
                                        <span className="text-muted-foreground">
                                            {" "}
                                            · {line.invoiceNumber}
                                        </span>
                                    ) : null}
                                    {partLabel(line) ? (
                                        <span className="text-muted-foreground">
                                            {" "}
                                            · month {partLabel(line)}
                                        </span>
                                    ) : null}
                                </span>
                                <span className="tabular-nums text-muted-foreground">
                                    {KIND_LABEL[line.kind]} ·{" "}
                                    {formatPaise(line.baseAmountPaise)} at{" "}
                                    {rateLabel(line.basisPoints)} ·{" "}
                                    <span className="text-foreground">
                                        {line.amountPaise === null
                                            ? "—"
                                            : formatPaise(line.amountPaise)}
                                    </span>{" "}
                                    · {LINE_STATUS_LABEL[line.status]}
                                </span>
                            </li>
                        ))}
                    </ul>
                </details>
            ) : null}
        </li>
    );
}

function MarkPaid({
    row,
    month,
    problem,
    onPaid,
}: {
    row: PayoutRow;
    month: string;
    problem: string | null;
    onPaid: (message: string) => void;
}) {
    return (
        <OperatorDialog
            trigger="Mark paid…"
            title={`Mark ${row.name}'s ${monthLabel(month)} commission paid?`}
            effect={
                <>
                    {formatPaise(row.amountPaise)} for {row.lineCount}{" "}
                    {row.lineCount === 1 ? "payment" : "payments"} is recorded
                    as paid, and {monthLabel(month)} is closed for them: a
                    payment that becomes payable later goes into next
                    month&apos;s statement. This can&apos;t be undone.
                </>
            }
            fields={
                <div className="grid gap-1.5">
                    <Label htmlFor={`payout-ref-${row.platformAdminId}`}>
                        Payment reference
                    </Label>
                    <Input
                        id={`payout-ref-${row.platformAdminId}`}
                        name="reference"
                        maxLength={120}
                        required
                        placeholder="The bank's UTR or transfer number"
                    />
                </div>
            }
            submitLabel="Mark paid"
            disabled={problem !== null}
            disabledReason={problem ?? undefined}
            quickReasons={["Paid by bank transfer"]}
            onSubmit={async ({ reason, idempotencyKey, values }) => {
                const reference = values.reference?.trim() ?? "";
                if (!reference) {
                    return {
                        ok: false,
                        error: "Give the payment's reference.",
                    };
                }
                const result = await markPayoutPaidAction({
                    platformAdminId: row.platformAdminId,
                    month,
                    reference,
                    reason,
                    idempotencyKey,
                });
                if (!result.ok) return { ok: false, error: result.error };
                onPaid(
                    `${row.name}'s ${monthLabel(month)} commission is marked paid.`,
                );
                return { ok: true };
            }}
        />
    );
}
