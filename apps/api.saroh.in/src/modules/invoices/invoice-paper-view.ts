import { rateToBps } from "./gst";
import { stateName } from "./gst-states";
import type { InvoiceTitle } from "./invoice-title";
import type { InvoiceViewModel } from "./serialize";

/**
 * The invoice's paper as words, laid out the way Invoice Detail prints it
 * (`app.saroh.in` `components/invoices/invoice-paper.tsx`, after "Saroh
 * Invoice Detail") — so the PDF (D16) and the printed paper agree line for
 * line. Pure: every figure is the one frozen on the invoice when it was
 * issued, formatted, never summed here.
 *
 * Only an issued paper is drawn, so the seller's address, GSTIN and state
 * are the ones frozen on it, never today's settings. The one difference
 * from the screen: dates carry their year, since a downloaded paper
 * outlives the year it was issued in.
 */

/** What the paper prints about the business beyond what it froze. */
export interface PaperBusiness {
    name: string;
    legalName: string | null;
    email: string | null;
}

export interface PaperLine {
    description: string;
    /** "GST 18% · taxable ₹2,034", "₹450 each", "less ₹50 discount". */
    sub: string | null;
    /** "9993", spaced like the screen; empty on an unregistered paper. */
    hsn: string;
    quantity: string;
    amount: string;
}

export interface PaperView {
    title: InvoiceTitle;
    number: string;
    /** "Issued 5 Sep 2026 · due 19 Sep 2026". */
    dates: string;
    /** "Against KD/26-27/0001" on a credit note; "Supplementary to …". */
    related: string | null;
    seller: {
        name: string;
        /** Legal name, registered address, contact email: those it has. */
        lines: string[];
        /** "GSTIN … · Karnataka (29)", or "Not registered for GST". */
        tax: string;
    };
    billedTo: {
        name: string;
        /** Their address, else their email. */
        detail: string | null;
        gstin: string | null;
    };
    /** "Karnataka (29) — CGST + SGST"; null where no tax is charged. */
    placeOfSupply: string | null;
    /** Whether the HSN / SAC column has a heading (a registered paper). */
    hsnColumn: boolean;
    lines: PaperLine[];
    /** Taxable value and its CGST + SGST or IGST, or a typed tax. */
    sums: [string, string][];
    totalLabel: "Total" | "Credited";
    total: string;
    /** "Prices include GST." on a tax invoice. */
    inclusive: string | null;
    footer: string;
}

const MONTHS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
];

/** "5 Sep 2026" in the business's zone: three letters every month. */
export function paperDay(iso: string, timeZone: string): string {
    const parts = new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "numeric",
        year: "numeric",
        timeZone,
    }).formatToParts(new Date(iso));
    const part = (type: string) =>
        Number(parts.find((p) => p.type === type)?.value ?? "");
    return `${part("day")} ${MONTHS[part("month") - 1] ?? ""} ${part("year")}`;
}

/** "₹2,400", "₹2,400.50": the screen's money (`formatMoneyMajor`). */
export function paperMoney(amount: string, currency: string): string {
    const value = Number(amount);
    if (!Number.isFinite(value)) return amount;
    return new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency,
        maximumFractionDigits: value % 1 === 0 ? 0 : 2,
    }).format(value);
}

/** "99930011" → "9993 00 11": HSN and SAC codes read in groups. */
function spacedCode(code: string | null | undefined): string {
    if (!code) return "";
    const c = code.replace(/\s+/g, "");
    return [c.slice(0, 4), c.slice(4, 6), c.slice(6)].filter(Boolean).join(" ");
}

/** Who it is billed to, as the paper names them. */
function billedTo(i: InvoiceViewModel): { name: string; email: string | null } {
    if (i.billTo) {
        return {
            name: i.billTo.name ?? i.billTo.email ?? "Unknown",
            email: i.billTo.email,
        };
    }
    if (i.contact) return { name: i.contact.name, email: i.contact.email };
    return { name: "No one chosen", email: null };
}

/** A registered business's paper with every line at 0%: no tax columns. */
function isExemptPaper(i: InvoiceViewModel): boolean {
    return Boolean(i.gst && i.exempt);
}

/**
 * What a line says about its GST (DEC-072): only where GST applies.
 *
 * - No tax charged on the paper (an unregistered business's receipt, a
 *   bill of supply): nothing, whatever the line holds.
 * - A rate never set (`gstRate` null, like a plan renewal's line): nothing
 *   — not "Nil-rated", not "0%". Not set is not a 0% supply.
 * - A rate recorded as exactly 0: "Nil-rated".
 * - Above 0: "GST 18% · taxable ₹2,400".
 */
export function lineGstNote(
    taxed: boolean,
    gst: { rate: string | null; taxableValue: string | null } | null,
    money: (amount: string) => string,
): string | null {
    if (!taxed || gst?.rate == null || gst.rate.trim() === "") {
        return null;
    }
    const bps = rateToBps(gst.rate);
    if (bps === null || !Number.isFinite(bps)) return null;
    if (bps === 0) return "Nil-rated";
    return `GST ${Number(gst.rate)}% · taxable ${money(gst.taxableValue ?? "0")}`;
}

/**
 * Whether a registered business's paper shows its GST totals (DEC-072) —
 * the taxable value, CGST and SGST or IGST, and "Prices include GST": only
 * when at least one line has a rate set, 0% included. A paper whose every
 * line has no rate set (a plan renewal's) shows just its total. The app's
 * `showsGstTotals` (`lib/invoices/paper-title.ts`) says the same on the
 * paper.
 */
export function showsGstTotals(i: Pick<InvoiceViewModel, "lines">): boolean {
    if (!i.lines) return true;
    return i.lines.some((l) => {
        const rate = l.gst?.rate;
        return rate != null && rate.trim() !== "";
    });
}

/** The line at the foot: the law it is issued under, and how it stands. */
export function paperFooter(i: InvoiceViewModel, businessName: string): string {
    if (i.gst) {
        const exempt = isExemptPaper(i);
        const law =
            i.kind === "CREDIT_NOTE"
                ? `Credit note under section 34, CGST Act, against ${i.related?.number ?? "the invoice named above"}.`
                : exempt
                  ? "Bill of supply under section 31(3)(c), CGST Act."
                  : "Tax invoice under section 31, CGST Act.";
        const basis = exempt
            ? " Supply exempt from GST."
            : " Reverse charge does not apply.";
        const state =
            i.standing === "CREDITED"
                ? " Cancelled by credit note."
                : i.standing === "PAID"
                  ? " Paid in full."
                  : "";
        return `${law}${basis}${state}`;
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

/**
 * The paper of an issued invoice read with its lines (`serializeInvoice`
 * with `detail`), in the business's zone.
 */
export function paperView(
    i: InvoiceViewModel & { number: string },
    business: PaperBusiness,
    timeZone: string,
): PaperView {
    const money = (a: string) => paperMoney(a, i.currency);
    const gst = i.gst;
    const taxed = gst && !isExemptPaper(i) ? gst : null;
    const credit = i.kind === "CREDIT_NOTE";
    const who = billedTo(i);

    const sellerState = gst?.sellerState
        ? stateName(gst.sellerState)
            ? `${stateName(gst.sellerState)} (${gst.sellerState})`
            : `State ${gst.sellerState}`
        : null;
    const legalName =
        business.legalName && business.legalName !== business.name
            ? business.legalName
            : null;

    const dates = i.issuedAt
        ? `Issued ${paperDay(i.issuedAt, timeZone)}${
              i.dueAt && !credit && !i.order
                  ? ` · due ${paperDay(i.dueAt, timeZone)}`
                  : ""
          }`
        : "";

    const typedTax = !gst && Number(i.tax) > 0;
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

    return {
        title: i.title,
        number: i.number,
        dates,
        related: i.related
            ? `${credit ? "Against" : "Supplementary to"} ${i.related.number ?? ""}`.trim()
            : null,
        seller: {
            name: business.name,
            lines: [legalName, i.sellerAddress, business.email].filter(
                (x): x is string => Boolean(x),
            ),
            tax: gst
                ? `GSTIN ${gst.sellerGstin}${sellerState ? ` · ${sellerState}` : ""}`
                : "Not registered for GST",
        },
        billedTo: {
            name: who.name,
            detail:
                i.billTo?.address ?? i.billToGst.address ?? who.email ?? null,
            gstin: i.billTo?.gstin ?? i.billToGst.gstin ?? null,
        },
        placeOfSupply: taxed
            ? `${
                  taxed.placeOfSupply
                      ? `${taxed.placeOfSupply.name ?? "State"} (${taxed.placeOfSupply.code})`
                      : "—"
              }${taxed.taxType === "INTER" ? " — IGST" : " — CGST + SGST"}`
            : null,
        hsnColumn: Boolean(gst),
        lines: (i.lines ?? []).map((l) => {
            const discount = Number(l.discount);
            const sub = [
                lineGstNote(Boolean(taxed), l.gst, money),
                l.quantity > 1 ? `${money(l.unitPrice)} each` : null,
                discount > 0
                    ? `less ${money(String(discount))} discount`
                    : null,
            ].filter(Boolean);
            return {
                description: l.description,
                sub: sub.length ? sub.join(" · ") : null,
                hsn: gst ? spacedCode(l.gst?.hsnSac) : "",
                quantity: String(l.quantity),
                amount: money(l.amount),
            };
        }),
        sums,
        totalLabel: credit ? "Credited" : "Total",
        total: money(i.total),
        inclusive: gstRows ? "Prices include GST." : null,
        footer: paperFooter(i, business.name),
    };
}
