import { paperColours, paperStyleOf } from "@saroh/block-contract";
import { AbsentValue } from "@saroh/ui/absent-value";
import { cn } from "@saroh/ui/lib/utils";
import type { CSSProperties } from "react";

import { ViewerDate } from "@/components/shared/viewer-date";
import { formatMoneyMajor } from "@/lib/format/money";
import { howToPayLines } from "@/lib/invoices/how-to-pay";
import {
    addedLineOf,
    isExemptPaper,
    lineEachNote,
    lineGstNote,
    lineRate,
    paperFooter,
    paperPrices,
    paperTitle,
    pricesSentence,
    showsGstTotals,
} from "@/lib/invoices/paper-title";
import { printedSeller } from "@/lib/invoices/seller";
import type { Invoice } from "@/lib/invoices/service";
import { billedTo, spacedCode } from "@/lib/invoices/status";
import type { InvoiceBusiness } from "@/lib/invoices/tax";
import { invoiceZone } from "@/lib/invoices/zone";

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
 * It is drawn in the invoice's look (DEC-173, U15 #1127): `paper`, the
 * draft's own or the business's default, frozen at issue. Classic carries
 * the colour on the title, the labels and the heavy rules; Band fills the
 * top with it, the seller and the number on it; Compact sets the seller
 * and the buyer side by side and its rows closer. The colours are the
 * shared rule's (`paperColours`), the PDF's, and no style leaves a Rule 46
 * particular off.
 *
 * Every figure is the API's, frozen when it was issued; nothing is summed
 * here. Unpaid paper prints "How to pay us" (#833) when the business set
 * it, as the PDF does. It is cream paper with dark ink in either theme (`.invoice-paper`),
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
    // Its dates in the business's zone, as the customer's copy prints them
    // (#836), never the viewer's.
    const zone = invoiceZone(business);
    const money = (a: string) => formatMoneyMajor(a, i.currency);
    const who = billedTo(i);
    const gst = i.gst ?? null;
    // GST charged on it: a tax invoice's columns, which a bill of supply
    // (and a credit note against one) leaves off.
    const taxed = gst && !isExemptPaper(i) ? gst : null;
    const credit = i.kind === "CREDIT_NOTE";
    const title = paperTitle(i);
    // The seller's GSTIN as it was at issue (DEC-082, #1161): issued paper
    // prints the one frozen on it, and only when it was issued as a tax
    // invoice — paper issued before the business registered has none, even
    // after a GSTIN is added. A draft prints today's.
    const gstin =
        i.status === "DRAFT"
            ? (business?.gstin ?? null)
            : (gst?.sellerGstin ?? null);
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
    // "How to pay us" on unpaid paper (#833), as the PDF prints it.
    const howToPay = howToPayLines(i, i.payInstructions);
    // Its look (DEC-173): an API older than styles is Classic in ink.
    const style = paperStyleOf(i.paper?.style);
    const colours = paperColours(style, i.paper?.colour);
    const band = colours.band;
    const compact = style === "COMPACT";
    const accent: CSSProperties | undefined = colours.coloured
        ? { color: colours.accent }
        : undefined;
    const rule: CSSProperties | undefined = colours.coloured
        ? { borderColor: colours.accent }
        : undefined;

    // No line with a rate set: no GST rows, just the total (DEC-072).
    const gstRows = taxed && showsGstTotals(i) ? taxed : null;
    // Whether its prices include GST, have it added, or both: the
    // sentence under the total, and what each line says on a mixed paper.
    const prices = paperPrices(taxed ? i.lines : []);
    const sentence = gstRows ? pricesSentence(prices) : null;
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

    // The seller, the number and who it's billed to: Band puts the first
    // two on its colour, Compact all three side by side.
    const sellerBlock = (
        <div className="min-w-0 flex-[1_1_200px]">
            {business?.logo ? (
                // eslint-disable-next-line @next/next/no-img-element -- a tenant's own image, outside next/image's allowlist
                <img
                    src={business.logo}
                    alt=""
                    className="mb-2 size-10 rounded-lg object-cover"
                />
            ) : null}
            <p
                className={cn(
                    "font-display font-semibold tracking-[-0.02em]",
                    compact ? "text-[17px]" : "text-[20px]",
                )}
            >
                {businessName}
            </p>
            <p
                className={cn(
                    "mt-[3px] text-[12px] leading-[1.5]",
                    band ? "opacity-85" : "text-muted-foreground",
                )}
            >
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
    );
    const numberBlock = (
        <div className="text-right">
            <p
                className={cn("label", band && "!text-current")}
                style={band ? undefined : accent}
            >
                {title}
            </p>
            <p className="mt-[3px] font-mono text-[15px]">
                {i.number ?? "Draft"}
            </p>
            <p
                className={cn(
                    "mt-[3px] text-[12px]",
                    band ? "opacity-85" : "text-muted-foreground",
                )}
            >
                {i.issuedAt ? (
                    <>
                        Issued{" "}
                        <ViewerDate
                            iso={i.issuedAt}
                            variant="dayMonth"
                            timeZone={zone}
                        />
                        {i.dueAt && !credit && !i.order ? (
                            <>
                                {" · due "}
                                <ViewerDate
                                    iso={i.dueAt}
                                    variant="dayMonth"
                                    timeZone={zone}
                                />
                            </>
                        ) : null}
                    </>
                ) : (
                    "Draft, not numbered"
                )}
            </p>
            {i.related ? (
                <p
                    className={cn(
                        "text-[12px]",
                        band ? "opacity-85" : "text-muted-foreground",
                    )}
                >
                    {credit ? "Against" : "Supplementary to"}{" "}
                    <span className="font-mono">{i.related.number}</span>
                </p>
            ) : null}
        </div>
    );
    const buyerBlock = (
        <div className="min-w-0 flex-[1_1_200px]">
            <p className="label" style={accent}>
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
    );

    return (
        <article
            aria-label={`The ${title.toLowerCase()} as it prints`}
            data-style={style}
            className="invoice-paper invoice-print overflow-hidden rounded-[6px] border border-border px-5 py-[22px] shadow-[0_6px_18px_hsl(60_4%_11%/0.08)] [overflow-wrap:anywhere] sm:px-7 sm:py-[26px] print:rounded-none print:border-0 print:p-0 print:shadow-none"
        >
            {band ? (
                <header
                    data-band={band.tone.toLowerCase()}
                    className="-mx-5 -mt-[22px] mb-1 flex flex-wrap items-start gap-4 px-5 py-4 sm:-mx-7 sm:-mt-[26px] sm:px-7 print:mx-0 print:mt-0"
                    style={{ backgroundColor: band.fill, color: band.text }}
                >
                    {sellerBlock}
                    {numberBlock}
                </header>
            ) : compact ? (
                <header
                    className="grid gap-4 border-b-2 border-foreground pb-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
                    style={rule}
                >
                    {sellerBlock}
                    {buyerBlock}
                    {numberBlock}
                </header>
            ) : (
                <header
                    className="flex flex-wrap items-start gap-4 border-b-2 border-foreground pb-4"
                    style={rule}
                >
                    {sellerBlock}
                    {numberBlock}
                </header>
            )}

            <div
                className={cn(
                    "flex flex-wrap gap-5",
                    compact ? "py-2.5" : "py-3.5",
                )}
            >
                {compact && !band ? null : buyerBlock}
                {taxed ? (
                    <div className="min-w-0 flex-[0_1_200px]">
                        <p className="label" style={accent}>
                            Place of supply
                        </p>
                        <p className="mt-1 text-[13px]">
                            {taxed.placeOfSupply ? (
                                `${taxed.placeOfSupply.name ?? "State"} (${taxed.placeOfSupply.code})`
                            ) : (
                                <AbsentValue says="Not set" />
                            )}
                            {taxed.taxType === "INTER"
                                ? " · IGST"
                                : " · CGST + SGST"}
                        </p>
                    </div>
                ) : null}
            </div>

            <div className="border-t border-border">
                <div
                    className={cn(
                        COLS,
                        hsnColumn ? DESK_WITH_HSN : DESK,
                        "label border-b border-border py-2",
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
                    // A line GST was added to prints its rate and its
                    // amount before GST, and its discount likewise.
                    const added = addedLineOf(Boolean(taxed), l);
                    const discount = Number(
                        added ? added.discount : (l.discount ?? 0),
                    );
                    const gstNote = lineGstNote(
                        Boolean(taxed),
                        l.gst ?? null,
                        money,
                        {
                            added: added?.gst ?? null,
                            mixed: prices === "MIXED",
                        },
                    );
                    const each = lineEachNote(l, added, money);
                    const less =
                        discount > 0
                            ? `less ${money(String(discount))} discount`
                            : null;
                    const code = gst ? spacedCode(l.gst?.hsnSac) : "";
                    // The desk's note under the name: HSN and Qty have
                    // columns of their own there.
                    const sub = [gstNote, each, less].filter(Boolean);
                    // A phone's second line carries what the columns would.
                    const phoneSub = [
                        code ? `HSN ${code}` : null,
                        l.quantity > 1
                            ? `${l.quantity} × ${money(lineRate(l, added))}${
                                  added?.unitPay
                                      ? `, ${money(added.unitPay)} each with GST`
                                      : ""
                              }`
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
                                "items-baseline border-b border-border/60",
                                compact
                                    ? "py-[5px] text-[12.5px]"
                                    : "py-[9px] text-[13px]",
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
                                {money(added ? added.amount : l.amount)}
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
                        style={rule}
                    >
                        <span className="flex-1">
                            {credit ? "Credited" : "Total"}
                        </span>
                        <span className="tabular-nums">{money(i.total)}</span>
                    </div>
                    {sentence ? (
                        <p className="mt-1 text-[11.5px] text-muted-foreground">
                            {sentence}
                        </p>
                    ) : null}
                </div>
            </div>

            {howToPay ? (
                <section
                    aria-label="How to pay us"
                    className="mt-[18px] break-inside-avoid"
                >
                    <p className="label" style={accent}>
                        How to pay us
                    </p>
                    {howToPay.map((line) => (
                        <p
                            key={line}
                            className="mt-1 text-[12.5px] leading-[1.5]"
                        >
                            {line}
                        </p>
                    ))}
                </section>
            ) : null}

            <p className="mt-[18px] border-t border-dashed border-border-strong pt-3 text-[12px] leading-[1.5] text-muted-foreground">
                {paperFooter(i, businessName)}
            </p>
        </article>
    );
}
