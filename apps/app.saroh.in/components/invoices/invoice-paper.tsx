import { ViewerDate } from "@/components/shared/viewer-date";
import { invoiceMoney } from "@/lib/invoices/money";
import type { Invoice } from "@/lib/invoices/service";
import { billedTo } from "@/lib/invoices/status";

/**
 * The invoice as it prints: one page, the business, the number and dates,
 * who it is billed to, the lines and the total — no rail, no buttons.
 *
 * Shown on screen beside the invoice as "What prints", and the only thing
 * left when the page is printed. `invoice-print` forces dark ink on white
 * whatever theme the screen is in (workspace.css), so an invoice printed
 * from the evening theme is not a black page.
 */
export function InvoicePaper({
    invoice,
    businessName,
}: {
    invoice: Invoice;
    businessName: string;
}) {
    const who = billedTo(invoice);
    const money = (a: string) => invoiceMoney(a, invoice.currency);
    const hasTax = Number(invoice.tax) > 0;

    return (
        <article
            aria-label="The invoice as it prints"
            className="invoice-print rounded-[4px] border border-border bg-card p-7 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none"
        >
            <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
                <div className="min-w-0">
                    <p className="font-display text-[19px] font-semibold tracking-[-0.02em]">
                        {businessName}
                    </p>
                </div>
                <div className="text-right text-[12.5px] text-muted-foreground">
                    <p className="font-mono text-[14px] text-foreground">
                        {invoice.number ?? "Draft — no number yet"}
                    </p>
                    {invoice.issuedAt ? (
                        <p>
                            Issued <ViewerDate iso={invoice.issuedAt} />
                        </p>
                    ) : null}
                    {invoice.dueAt ? (
                        <p>
                            Due <ViewerDate iso={invoice.dueAt} />
                        </p>
                    ) : null}
                </div>
            </header>

            <section className="py-5">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    Billed to
                </h2>
                <p className="mt-1.5 text-[14px]">{who.name}</p>
                {who.email ? (
                    <p className="text-[12.5px] text-muted-foreground">
                        {who.email}
                    </p>
                ) : null}
            </section>

            <table className="w-full text-[13px]">
                <thead>
                    <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                        <th className="pb-2 text-left font-semibold">Line</th>
                        <th className="pb-2 text-right font-semibold">
                            Amount
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {(invoice.lines ?? []).map((l) => (
                        <tr key={l.id}>
                            <td className="py-2 pr-4">
                                {l.description}
                                {l.quantity > 1 ? (
                                    <span className="text-muted-foreground">
                                        {" "}
                                        · {l.quantity} × {money(l.unitPrice)}
                                    </span>
                                ) : null}
                            </td>
                            <td className="py-2 text-right tabular-nums">
                                {money(l.amount)}
                            </td>
                        </tr>
                    ))}
                    <tr className="text-muted-foreground">
                        <td className="py-2">Tax</td>
                        <td className="py-2 text-right tabular-nums">
                            {hasTax ? money(invoice.tax) : "None"}
                        </td>
                    </tr>
                </tbody>
                <tfoot>
                    <tr className="border-t border-border">
                        <th className="pt-3 text-left font-display text-[16px] font-semibold">
                            Total
                        </th>
                        <td className="pt-3 text-right font-display text-[18px] font-semibold tabular-nums">
                            {money(invoice.total)}
                        </td>
                    </tr>
                </tfoot>
            </table>

            {invoice.status === "PAID" && invoice.paidAt ? (
                <p className="mt-5 text-[12.5px]">
                    Paid <ViewerDate iso={invoice.paidAt} />. Thank you.
                </p>
            ) : null}
            {invoice.status === "VOID" ? (
                <p className="mt-5 text-[12.5px] font-semibold">
                    Void — this invoice is not to be paid.
                </p>
            ) : null}
        </article>
    );
}
