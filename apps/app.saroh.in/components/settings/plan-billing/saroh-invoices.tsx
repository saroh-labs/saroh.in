import { formatInr } from "@saroh/pricing-catalog";
import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { EmptyState, FailedState } from "@saroh/ui/data-state";
import { cn } from "@saroh/ui/lib/utils";
import { ReceiptText } from "lucide-react";

import { ViewerDate } from "@/components/shared/viewer-date";
import type { SarohInvoice } from "@/lib/saroh-billing/plan-view";

import { RefreshButton } from "./refresh-button";
import { card, cardHead } from "./styles";

/**
 * "Invoices from Saroh" (U17): every invoice Saroh has written the business,
 * newest first. Each is written with the charge it's for, so each is paid.
 * `null` is a list that couldn't be read — said, never drawn as "none".
 */
export function SarohInvoices({
    invoices,
}: {
    invoices: SarohInvoice[] | null;
}) {
    return (
        <section aria-label="Invoices from Saroh" className={card}>
            <h3 className={cardHead}>Invoices from Saroh</h3>
            {invoices === null ? (
                <FailedState
                    title="Saroh's invoices couldn't be loaded"
                    description="This doesn't mean there are none. Nothing has been changed."
                    action={<RefreshButton />}
                    className="rounded-none border-0 py-8 sm:py-8"
                />
            ) : invoices.length === 0 ? (
                <EmptyState
                    icon={<ReceiptText />}
                    title="No invoices from Saroh yet"
                    description="Saroh hasn't charged this business for anything. Each charge's invoice lands here."
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
                        <span className="min-w-0 flex-[1_1_160px] font-mono text-[12px] [overflow-wrap:anywhere]">
                            {invoice.number}
                        </span>
                        <span className="tabular-nums">
                            {formatInr(invoice.totalPaise)}
                        </span>
                        <Badge
                            variant="success"
                            className="px-2 text-[11px] font-semibold uppercase tracking-[0.04em]"
                        >
                            Paid
                        </Badge>
                        <Button asChild variant="ghost" size="sm">
                            <a
                                href={`/api/saroh-invoices/${encodeURIComponent(invoice.id)}/pdf`}
                                download
                                aria-label={`Download ${invoice.number} as a PDF`}
                            >
                                Download PDF
                            </a>
                        </Button>
                    </div>
                ))
            )}
        </section>
    );
}
