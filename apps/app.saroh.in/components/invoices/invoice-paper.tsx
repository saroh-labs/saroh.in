import { cn } from "@saroh/ui/lib/utils";

import { ViewerDate } from "@/components/shared/viewer-date";
import { formatMoneyMajor } from "@/lib/format/money";
import type { Invoice } from "@/lib/invoices/service";
import { billedTo, spacedCode } from "@/lib/invoices/status";
import type { InvoiceBusiness } from "@/lib/invoices/tax";

/** What the paper is called: a tax invoice, a receipt, a credit note. */
export function paperTitle(
    i: Pick<Invoice, "gst" | "kind" | "standing">,
): string {
    if (i.kind === "CREDIT_NOTE") return "Credit note";
    if (i.gst) return "Tax invoice";
    return i.standing === "PAID" || i.standing === "CREDITED"
        ? "Receipt"
        : "Invoice";
}

/**
 * The invoice as the customer receives it, after "Saroh Invoice Detail": a
 * tax invoice for a GST-registered business — the seller's legal name,
 * registered address (frozen on issue, like the GSTIN), GSTIN and state,
 * who it is billed to (with their GSTIN when they are registered), the place
 * of supply, HSN/SAC and rate on every line, taxable value and CGST + SGST
 * or IGST — or a receipt for a business that is not registered.
 *
 * Every figure is the API's, frozen when it was issued; nothing is summed
 * here. It is cream paper with dark ink in either theme (`.invoice-paper`),
 * and the only thing left when the page is printed (`.invoice-print`).
 */
export function InvoicePaper({
    invoice: i,
    business,
    businessName,
}: {
    invoice: Invoice;
    /** Null when this role cannot read the business's settings. */
    business: InvoiceBusiness | null;
    businessName: string;
}) {
    const money = (a: string) => formatMoneyMajor(a, i.currency) ?? a;
    const who = billedTo(i);
    const gst = i.gst ?? null;
    const credit = i.kind === "CREDIT_NOTE";
    const title = paperTitle(i);
    const gstin = gst?.sellerGstin ?? business?.gstin ?? null;
    const sellerState =
        gst?.sellerState && business?.state?.code === gst.sellerState
            ? `${business.state.name ?? ""} (${gst.sellerState})`
            : gst?.sellerState
              ? `State ${gst.sellerState}`
              : null;
    // CGST rule 46: the supplier's address. Issued paper prints the one
    // frozen on it; a draft, today's.
    const sellerAddress =
        i.status === "DRAFT"
            ? (business?.address ?? null)
            : (i.sellerAddress ?? null);
    const legalName =
        business?.legalName && business.legalName !== businessName
            ? business.legalName
            : null;
    const sellerLines = [
        legalName,
        sellerAddress,
        business?.email ?? null,
    ].filter((x): x is string => Boolean(x));
    const address = i.billTo?.address ?? i.billToGst?.address ?? null;
    const buyerGstin = i.billTo?.gstin ?? i.billToGst?.gstin ?? null;
    const typedTax = !gst && Number(i.tax) > 0;

    const sums: [string, string][] = gst
        ? [
              ["Taxable value", money(i.subtotal)],
              ...(gst.taxType === "INTER"
                  ? ([["IGST", money(gst.igst)]] as [string, string][])
                  : ([
                        ["CGST", money(gst.cgst)],
                        ["SGST", money(gst.sgst)],
                    ] as [string, string][])),
          ]
        : typedTax
          ? [
                ["Subtotal", money(i.subtotal)],
                ["Tax", money(i.tax)],
            ]
          : [];

    return (
        <article
            aria-label={`The ${title.toLowerCase()} as it prints`}
            className="invoice-paper invoice-print rounded-[6px] border border-border px-5 py-[22px] shadow-[0_6px_18px_hsl(60_4%_11%/0.08)] sm:px-7 sm:py-[26px] print:rounded-none print:border-0 print:p-0 print:shadow-none"
        >
            <header className="flex flex-wrap items-start gap-4 border-b-2 border-foreground pb-4">
                <div className="min-w-0 flex-[1_1_200px]">
                    <p className="font-display text-[20px] font-semibold tracking-[-0.02em]">
                        {businessName}
                    </p>
                    <p className="mt-[3px] text-[12px] leading-[1.5] text-muted-foreground">
                        {sellerLines.map((line) => (
                            <span key={line} className="block">
                                {line}
                            </span>
                        ))}
                        {gst || gstin
                            ? `GSTIN ${gstin ?? ""}${sellerState ? ` · ${sellerState}` : ""}`
                            : "Not registered for GST"}
                    </p>
                </div>
                <div className="text-right">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                        {title}
                    </p>
                    <p className="mt-[3px] font-mono text-[15px]">
                        {i.number ?? "Draft"}
                    </p>
                    <p className="mt-[3px] text-[12px] text-muted-foreground">
                        {i.issuedAt ? (
                            <>
                                Issued{" "}
                                <ViewerDate
                                    iso={i.issuedAt}
                                    variant="dayMonth"
                                />
                                {i.dueAt && !credit && !i.order ? (
                                    <>
                                        {" · due "}
                                        <ViewerDate
                                            iso={i.dueAt}
                                            variant="dayMonth"
                                        />
                                    </>
                                ) : null}
                            </>
                        ) : (
                            "Draft — not numbered"
                        )}
                    </p>
                    {i.related ? (
                        <p className="text-[12px] text-muted-foreground">
                            {credit ? "Against" : "Supplementary to"}{" "}
                            <span className="font-mono">
                                {i.related.number}
                            </span>
                        </p>
                    ) : null}
                </div>
            </header>

            <div className="flex flex-wrap gap-5 py-3.5">
                <div className="min-w-0 flex-[1_1_200px]">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                        Billed to
                    </p>
                    <p className="mt-1 text-[14px] font-semibold">{who.name}</p>
                    {address || who.email ? (
                        <p className="text-[12px] leading-[1.5] text-muted-foreground">
                            {address ?? who.email}
                        </p>
                    ) : null}
                    {buyerGstin ? (
                        <p className="mt-[3px] font-mono text-[12px]">
                            GSTIN {buyerGstin}
                        </p>
                    ) : null}
                </div>
                {gst ? (
                    <div className="min-w-0 flex-[0_1_200px]">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                            Place of supply
                        </p>
                        <p className="mt-1 text-[13px]">
                            {gst.placeOfSupply
                                ? `${gst.placeOfSupply.name ?? "State"} (${gst.placeOfSupply.code})`
                                : "—"}
                            {gst.taxType === "INTER"
                                ? " — IGST"
                                : " — CGST + SGST"}
                        </p>
                    </div>
                ) : null}
            </div>

            <div className="overflow-x-auto border-t border-border">
                <div className="min-w-[300px]">
                    <div className="grid grid-cols-[minmax(0,3fr)_70px_56px_90px] gap-2 border-b border-border py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        <span>Item</span>
                        <span>{gst ? "HSN / SAC" : ""}</span>
                        <span className="text-right">Qty</span>
                        <span className="text-right">Amount</span>
                    </div>
                    {(i.lines ?? []).map((l) => {
                        const rate = l.gst?.rate ? Number(l.gst.rate) : null;
                        const discount = Number(l.discount ?? 0);
                        const sub = [
                            gst
                                ? rate
                                    ? `GST ${rate}% · taxable ${money(l.gst?.taxableValue ?? "0")}`
                                    : "Nil-rated"
                                : null,
                            l.quantity > 1
                                ? `${money(l.unitPrice)} each`
                                : null,
                            discount > 0
                                ? `less ${money(String(discount))} discount`
                                : null,
                        ].filter(Boolean);
                        return (
                            <div
                                key={l.id}
                                className="grid grid-cols-[minmax(0,3fr)_70px_56px_90px] items-baseline gap-2 border-b border-border/60 py-[9px] text-[13px]"
                            >
                                <span className="min-w-0">
                                    {l.description}
                                    {sub.length ? (
                                        <span className="block text-[11.5px] text-muted-foreground">
                                            {sub.join(" · ")}
                                        </span>
                                    ) : null}
                                </span>
                                <span className="font-mono text-[11.5px] text-muted-foreground">
                                    {gst ? spacedCode(l.gst?.hsnSac) : ""}
                                </span>
                                <span className="text-right tabular-nums">
                                    {l.quantity}
                                </span>
                                <span className="text-right font-semibold tabular-nums">
                                    {money(l.amount)}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="flex justify-end pt-2.5">
                <div className="w-full max-w-[280px]">
                    {sums.map(([k, v]) => (
                        <div key={k} className="flex py-[3px] text-[12.5px]">
                            <span className="flex-1">{k}</span>
                            <span className="tabular-nums">{v}</span>
                        </div>
                    ))}
                    <div
                        className={cn(
                            "flex border-t-2 border-foreground pt-2 text-[16px] font-bold",
                            sums.length > 0 && "mt-[5px]",
                        )}
                    >
                        <span className="flex-1">
                            {credit ? "Credited" : "Total"}
                        </span>
                        <span className="tabular-nums">{money(i.total)}</span>
                    </div>
                    {gst ? (
                        <p className="mt-1 text-[11.5px] text-muted-foreground">
                            Prices include GST.
                        </p>
                    ) : null}
                </div>
            </div>

            <p className="mt-[18px] border-t border-dashed border-border-strong pt-3 text-[12px] leading-[1.5] text-muted-foreground">
                {footer(i, businessName)}
            </p>
        </article>
    );
}

function footer(i: Invoice, businessName: string): string {
    if (i.gst) {
        const law =
            i.kind === "CREDIT_NOTE"
                ? `Credit note under section 34, CGST Act, against ${i.related?.number ?? "the invoice named above"}.`
                : "Tax invoice under section 31, CGST Act.";
        const state =
            i.standing === "CREDITED"
                ? " Cancelled by credit note."
                : i.standing === "PAID"
                  ? " Paid in full."
                  : "";
        return `${law} Reverse charge does not apply.${state}`;
    }
    const paid =
        i.standing === "PAID"
            ? "Receipt — paid in full. "
            : i.standing === "VOID"
              ? "Void — this is not to be paid. "
              : i.standing === "CREDITED"
                ? "Cancelled by credit note. "
                : "";
    return Number(i.tax) > 0
        ? `${paid}${businessName} is not registered for GST.`
        : `${paid}${businessName} is not registered for GST, so no tax is charged.`;
}
