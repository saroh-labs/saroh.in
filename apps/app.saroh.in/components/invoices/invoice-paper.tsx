import { cn } from "@saroh/ui/lib/utils";

import { ViewerDate } from "@/components/shared/viewer-date";
import { formatMoneyMajor } from "@/lib/format/money";
import {
    isExemptPaper,
    lineGstNote,
    paperFooter,
    paperTitle,
    showsGstTotals,
} from "@/lib/invoices/paper-title";
import { printedSeller } from "@/lib/invoices/seller";
import type { Invoice } from "@/lib/invoices/service";
import { billedTo, spacedCode } from "@/lib/invoices/status";
import type { InvoiceBusiness } from "@/lib/invoices/tax";

/**
 * Line rows: a phone (below `sm`) gives the item the row and the amount the
 * right edge, with HSN, quantity × price and GST on a muted second line;
 * the desk, and print, keep the columns (T6).
 */
const COLS = "grid grid-cols-[minmax(0,1fr)_auto] gap-x-2";
const DESK =
    "sm:grid-cols-[minmax(0,3fr)_56px_90px] print:grid-cols-[minmax(0,3fr)_56px_90px]";
const DESK_WITH_HSN =
    "sm:grid-cols-[minmax(0,3fr)_70px_56px_90px] print:grid-cols-[minmax(0,3fr)_70px_56px_90px]";
const DESK_ONLY = "hidden sm:block print:block";

/**
 * The invoice as the customer receives it, after "Saroh Invoice Detail": a
 * tax invoice for a GST-registered business — the seller's logo (today's,
 * not frozen on issue: it is branding, not a GST particular), its name,
 * legal name, contact email and registered address (frozen on issue, like
 * the GSTIN, DEC-082), GSTIN and state,
 * who it is billed to (with their GSTIN when they are registered), the place
 * of supply, HSN/SAC on every line and its rate where one is set (a rate
 * never set says nothing, DEC-072), taxable value and CGST + SGST
 * or IGST — or a receipt for a business that is not registered. A
 * registered business's paper whose every line is exempt is a bill of
 * supply (D15): its GSTIN and SAC, and no place of supply or tax columns.
 *
 * Every figure is the API's, frozen when it was issued; nothing is summed
 * here. It is cream paper with dark ink in either theme (`.invoice-paper`),
 * and the only thing left when the page is printed (`.invoice-print`).
 */
export function InvoicePaper({
    invoice: i,
    business,
    businessName: todayName,
}: {
    invoice: Invoice;
    /** Null when this role cannot read the business's settings. */
    business: InvoiceBusiness | null;
    /** Today's name: a draft prints it; issued paper, the one it froze. */
    businessName: string;
}) {
    // Issued paper names the seller as it was at issue; a draft, today.
    const seller = printedSeller(i, {
        name: todayName,
        legalName: business?.legalName ?? null,
        email: business?.email ?? null,
    });
    const businessName = seller.name;
    const money = (a: string) => formatMoneyMajor(a, i.currency) ?? a;
    const who = billedTo(i);
    const gst = i.gst ?? null;
    // GST charged on it: a tax invoice's columns, which a bill of supply
    // (and a credit note against one) leaves off.
    const taxed = gst && !isExemptPaper(i) ? gst : null;
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
        seller.legalName && seller.legalName !== businessName
            ? seller.legalName
            : null;
    const sellerLines = [legalName, sellerAddress, seller.email].filter(
        (x): x is string => Boolean(x),
    );
    const address = i.billTo?.address ?? i.billToGst?.address ?? null;
    const buyerGstin = i.billTo?.gstin ?? i.billToGst?.gstin ?? null;
    const typedTax = !gst && Number(i.tax) > 0;
    // A bill of supply, a receipt or lines without codes: no HSN column.
    const hsnColumn =
        Boolean(gst) && (i.lines ?? []).some((l) => l.gst?.hsnSac?.trim());

    // No line with a rate set: no GST rows, just the total (DEC-072).
    const gstRows = taxed && showsGstTotals(i) ? taxed : null;
    const sums: [string, string][] = gstRows
        ? [
              ["Taxable value", money(i.subtotal)],
              ...(gstRows.taxType === "INTER"
                  ? ([["IGST", money(gstRows.igst)]] as [string, string][])
                  : ([
                        ["CGST", money(gstRows.cgst)],
                        ["SGST", money(gstRows.sgst)],
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
            className="invoice-paper invoice-print rounded-[6px] border border-border px-5 py-[22px] shadow-[0_6px_18px_hsl(60_4%_11%/0.08)] [overflow-wrap:anywhere] sm:px-7 sm:py-[26px] print:rounded-none print:border-0 print:p-0 print:shadow-none"
        >
            <header className="flex flex-wrap items-start gap-4 border-b-2 border-foreground pb-4">
                <div className="min-w-0 flex-[1_1_200px]">
                    {business?.logo ? (
                        // eslint-disable-next-line @next/next/no-img-element -- a tenant's own image, outside next/image's allowlist
                        <img
                            src={business.logo}
                            alt=""
                            className="mb-2 size-10 rounded-lg object-cover"
                        />
                    ) : null}
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
                {taxed ? (
                    <div className="min-w-0 flex-[0_1_200px]">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                            Place of supply
                        </p>
                        <p className="mt-1 text-[13px]">
                            {taxed.placeOfSupply
                                ? `${taxed.placeOfSupply.name ?? "State"} (${taxed.placeOfSupply.code})`
                                : "—"}
                            {taxed.taxType === "INTER"
                                ? " — IGST"
                                : " — CGST + SGST"}
                        </p>
                    </div>
                ) : null}
            </div>

            <div className="border-t border-border">
                <div
                    className={cn(
                        COLS,
                        hsnColumn ? DESK_WITH_HSN : DESK,
                        "border-b border-border py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground",
                    )}
                >
                    <span>Item</span>
                    {hsnColumn ? (
                        <span className={DESK_ONLY}>HSN / SAC</span>
                    ) : null}
                    <span className={cn(DESK_ONLY, "text-right")}>Qty</span>
                    <span className="text-right">Amount</span>
                </div>
                {(i.lines ?? []).map((l) => {
                    const discount = Number(l.discount ?? 0);
                    const gstNote = lineGstNote(
                        Boolean(taxed),
                        l.gst ?? null,
                        money,
                    );
                    const less =
                        discount > 0
                            ? `less ${money(String(discount))} discount`
                            : null;
                    const code = gst ? spacedCode(l.gst?.hsnSac) : "";
                    // The desk's note under the name: HSN and Qty have
                    // columns of their own there.
                    const sub = [
                        gstNote,
                        l.quantity > 1 ? `${money(l.unitPrice)} each` : null,
                        less,
                    ].filter(Boolean);
                    // A phone's second line carries what the columns would.
                    const phoneSub = [
                        code ? `HSN ${code}` : null,
                        l.quantity > 1
                            ? `${l.quantity} × ${money(l.unitPrice)}`
                            : null,
                        gstNote,
                        less,
                    ].filter(Boolean);
                    return (
                        <div
                            key={l.id}
                            className={cn(
                                COLS,
                                hsnColumn ? DESK_WITH_HSN : DESK,
                                "items-baseline border-b border-border/60 py-[9px] text-[13px]",
                            )}
                        >
                            <span className="min-w-0">
                                {l.description}
                                {sub.length ? (
                                    <span
                                        className={cn(
                                            DESK_ONLY,
                                            "text-[11.5px] text-muted-foreground",
                                        )}
                                    >
                                        {sub.join(" · ")}
                                    </span>
                                ) : null}
                            </span>
                            {hsnColumn ? (
                                <span
                                    className={cn(
                                        DESK_ONLY,
                                        "font-mono text-[11.5px] text-muted-foreground",
                                    )}
                                >
                                    {code}
                                </span>
                            ) : null}
                            <span
                                className={cn(
                                    DESK_ONLY,
                                    "text-right tabular-nums",
                                )}
                            >
                                {l.quantity}
                            </span>
                            <span className="text-right font-semibold tabular-nums">
                                {money(l.amount)}
                            </span>
                            {phoneSub.length ? (
                                <span
                                    data-phone-line
                                    className="col-span-full mt-0.5 text-[11.5px] text-muted-foreground sm:hidden print:hidden"
                                >
                                    {phoneSub.join(" · ")}
                                </span>
                            ) : null}
                        </div>
                    );
                })}
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
                    {gstRows ? (
                        <p className="mt-1 text-[11.5px] text-muted-foreground">
                            Prices include GST.
                        </p>
                    ) : null}
                </div>
            </div>

            <p className="mt-[18px] border-t border-dashed border-border-strong pt-3 text-[12px] leading-[1.5] text-muted-foreground">
                {paperFooter(i, businessName)}
            </p>
        </article>
    );
}
