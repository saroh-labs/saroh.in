import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import { cn } from "@saroh/ui/lib/utils";
import { CircleAlert, ReceiptText } from "lucide-react";

import { ViewerDate } from "@/components/shared/viewer-date";
import { formatMoney } from "@/lib/format/money";
import type {
    PlanOption,
    PlanSummary,
    SarohInvoice,
} from "@/lib/saroh-billing/plan";

/**
 * Settings → Plan and billing ("Saroh Settings" design): the plan this
 * business is on, the plans it could be on, and what Saroh has billed it.
 * Three cards, 760px at most, each ruled like Business's.
 *
 * Only what the API knows is drawn as fact. Where the design shows figures
 * the product cannot yet back — a usage line, invoices, a working "Upgrade" —
 * the card keeps its place and says so (`lib/saroh-billing/service.ts`).
 */
export function PlanBilling({
    summary,
    options,
    canChange,
    invoices,
    neverBilled,
}: {
    summary: PlanSummary;
    /** The catalogue; empty when Saroh has published no plans. */
    options: PlanOption[];
    /** False until the API has a checkout step for a paid plan. */
    canChange: boolean;
    /** Null until the API keeps Saroh's invoices. */
    invoices: SarohInvoice[] | null;
    /** No subscription, ever: Saroh has charged this business nothing. */
    neverBilled: boolean;
}) {
    return (
        <div className="grid max-w-[760px] gap-4">
            <YourPlan summary={summary} />
            <ChangePlan options={options} canChange={canChange} />
            <Invoices invoices={invoices} neverBilled={neverBilled} />
        </div>
    );
}

const card = "overflow-hidden rounded-xl border border-border bg-card";
const cardHead =
    "border-b border-border/70 px-[18px] py-3 font-display text-[15px] font-semibold";

function YourPlan({ summary }: { summary: PlanSummary }) {
    const { next } = summary;
    return (
        <section aria-label="Your plan" className={card}>
            <div className="flex flex-wrap items-start gap-3.5 px-[18px] py-4">
                <div className="min-w-0 flex-[1_1_260px]">
                    <p className="text-[12px] text-muted-foreground">
                        Your plan
                    </p>
                    <p className="mt-0.5 font-display text-[24px] font-semibold tracking-[-0.02em]">
                        {summary.name}{" "}
                        {summary.price ? (
                            <span className="text-[15px] font-medium text-foreground/80">
                                {summary.price}
                            </span>
                        ) : null}
                    </p>
                    <p className="mt-1 text-pretty text-[13px] text-foreground/80">
                        {summary.includes}
                    </p>
                </div>
                <div className="flex-[0_1_auto] sm:text-right">
                    <p className="text-[12px] text-muted-foreground">
                        Next charge
                    </p>
                    <p className="mt-0.5 text-[14px] font-semibold">
                        {next.kind === "charge" ? (
                            <>
                                <ViewerDate iso={next.iso} /> · {next.amount}
                            </>
                        ) : next.kind === "ends" ? (
                            <>
                                Ends <ViewerDate iso={next.iso} />
                            </>
                        ) : (
                            next.text
                        )}
                    </p>
                    {summary.method ? (
                        <p className="mt-0.5 text-[12px] text-muted-foreground">
                            {summary.method}
                        </p>
                    ) : null}
                </div>
            </div>
            {summary.warning ? (
                <p
                    role="note"
                    className="flex items-start gap-2 border-t border-border/70 px-[18px] py-3 text-[13px] font-medium"
                >
                    <CircleAlert
                        aria-hidden
                        className="mt-px size-4 shrink-0"
                    />
                    {summary.warning}
                </p>
            ) : null}
            <p className="text-pretty border-t border-border/70 bg-muted/50 px-[18px] py-3 text-[13px] text-foreground/80">
                {summary.footnote}
            </p>
        </section>
    );
}

function ChangePlan({
    options,
    canChange,
}: {
    options: PlanOption[];
    canChange: boolean;
}) {
    return (
        <section aria-label="Change plan" className={card}>
            <p className="border-b border-border/70 px-[18px] py-3 text-[12.5px] text-muted-foreground">
                {options.length === 0
                    ? "Saroh's plans and prices aren't published yet."
                    : canChange
                      ? "Change plan any time."
                      : "Changing plan here isn't switched on yet. These are Saroh's plans and what each includes."}
            </p>
            {options.length === 0 ? (
                <p className="px-[18px] py-4 text-[13px] text-foreground/80">
                    When they are, each one is listed here with its price and
                    what it includes.
                </p>
            ) : (
                options.map((plan, i) => (
                    <div
                        key={plan.key}
                        className={cn(
                            "flex flex-wrap items-center gap-3 px-[18px] py-[13px]",
                            i > 0 && "border-t border-border/70",
                            plan.current && "bg-muted/50",
                        )}
                    >
                        <div className="min-w-0 flex-[1_1_240px]">
                            <p className="text-[14px] font-semibold">
                                {plan.name}{" "}
                                <span className="font-medium text-foreground/80">
                                    {plan.price}
                                </span>
                            </p>
                            <p className="mt-0.5 text-[12px] text-muted-foreground">
                                {plan.includes}
                            </p>
                        </div>
                        {plan.current ? (
                            <span className="text-[12.5px] font-semibold text-foreground/80">
                                Current plan
                            </span>
                        ) : (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={!canChange}
                                aria-label={`${plan.cta} to ${plan.name}`}
                            >
                                {plan.cta}
                            </Button>
                        )}
                    </div>
                ))
            )}
        </section>
    );
}

function Invoices({
    invoices,
    neverBilled,
}: {
    invoices: SarohInvoice[] | null;
    neverBilled: boolean;
}) {
    return (
        <section aria-label="Invoices from Saroh" className={card}>
            <h3 className={cardHead}>Invoices from Saroh</h3>
            {invoices === null || invoices.length === 0 ? (
                // "No invoices yet" only where it is true: with no plan ever,
                // or once the API lists them. Until then an empty list is a
                // list that isn't connected, and says so.
                <EmptyState
                    icon={<ReceiptText />}
                    title={
                        neverBilled || invoices !== null
                            ? "No invoices from Saroh yet"
                            : "Not listed here yet"
                    }
                    description={
                        neverBilled || invoices !== null
                            ? "Saroh hasn't charged this business for anything."
                            : "Saroh's invoices to this business aren't listed in the workspace yet, so an empty list here doesn't mean nothing was billed."
                    }
                    className="rounded-none border-0 py-8 sm:py-8"
                />
            ) : (
                invoices.map((invoice, i) => (
                    <div
                        key={invoice.id}
                        className={cn(
                            "flex flex-wrap items-center gap-3 px-[18px] py-[11px] text-[13px]",
                            i > 0 && "border-t border-border/70",
                        )}
                    >
                        <span className="flex-[0_0_90px] text-muted-foreground">
                            <ViewerDate iso={invoice.issuedAt} />
                        </span>
                        <span className="flex-[1_1_160px] font-mono text-[12px]">
                            {invoice.number}
                        </span>
                        <span className="tabular-nums">
                            {formatMoney(invoice.amountCents, invoice.currency)}
                        </span>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em]">
                            {invoice.status === "PAID"
                                ? "Paid"
                                : invoice.status === "DUE"
                                  ? "Due"
                                  : "Void"}
                        </span>
                        {invoice.pdfUrl ? (
                            <Button asChild variant="ghost" size="sm">
                                <a href={invoice.pdfUrl} download>
                                    Download PDF
                                </a>
                            </Button>
                        ) : null}
                    </div>
                ))
            )}
        </section>
    );
}
