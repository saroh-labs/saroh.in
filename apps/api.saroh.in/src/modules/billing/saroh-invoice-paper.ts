import type { SarohInvoice, SarohInvoiceLine } from "@saroh/database";

import { stateName } from "../invoices/gst-states";
import type { PaperView } from "../invoices/invoice-paper-view";
import { paperDay } from "../invoices/invoice-paper-view";
import { pdfFileName, renderInvoicePdf } from "../invoices/invoice-pdf";
import { paiseToRupees, SAROH_TIMEZONE } from "./saroh-invoice-terms";

/**
 * A Saroh invoice as the paper the D16 renderer draws (`invoice-pdf.ts`),
 * so Saroh's own invoices read like the ones businesses send their
 * customers. Pure: every figure is the one frozen on the invoice.
 *
 * Saroh's prices are before GST, so each line shows its taxable amount and
 * the sums add the GST to it: Taxable value, CGST + SGST or IGST, Total.
 * Without Saroh's GSTIN configured the paper is an "Invoice", never a tax
 * invoice.
 */

function stateLabel(code: string | null): string | null {
    if (!code) return null;
    const name = stateName(code);
    return name ? `${name} (${code})` : `State ${code}`;
}

/** "9983 14": an SAC reads in groups, as on a business's paper. */
function spaced(code: string | null): string {
    if (!code) return "";
    const c = code.replace(/\s+/g, "");
    return [c.slice(0, 4), c.slice(4, 6), c.slice(6)].filter(Boolean).join(" ");
}

/** "₹1.00": Saroh's paper always shows the paise (KTD-18's amounts). */
function money2(paise: number, currency: string): string {
    return new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(Number(paiseToRupees(paise)));
}

/** 1800 bps → "18%", 900 → "9%", 250 → "2.5%". */
function percent(bps: number): string {
    return `${Number((bps / 100).toFixed(2))}%`;
}

type TaxRow = [label: string, paise: number];

/**
 * The tax rows with their rates (CGST Rule 46(j)): each line's GST rate,
 * half each for CGST and SGST within the state, the whole as IGST across
 * states. Lines at the same rate share a row; a paper with lines at two
 * rates shows a row per rate. Never a typed rate: always the line's own.
 */
export function sarohTaxRows(
    lines: Pick<
        SarohInvoiceLine,
        "gstRateBps" | "cgstPaise" | "sgstPaise" | "igstPaise"
    >[],
    intra: boolean,
): TaxRow[] {
    const byRate = new Map<number, { c: number; s: number; i: number }>();
    for (const l of lines) {
        const r = byRate.get(l.gstRateBps) ?? { c: 0, s: 0, i: 0 };
        r.c += l.cgstPaise;
        r.s += l.sgstPaise;
        r.i += l.igstPaise;
        byRate.set(l.gstRateBps, r);
    }
    const rows: TaxRow[] = [];
    for (const [bps, r] of [...byRate].sort(([a], [b]) => b - a)) {
        if (intra) {
            rows.push([`CGST ${percent(bps / 2)}`, r.c]);
            rows.push([`SGST ${percent(bps / 2)}`, r.s]);
        } else {
            rows.push([`IGST ${percent(bps)}`, r.i]);
        }
    }
    return rows;
}

/** The words under the total that say who issued it (Rule 46(q)). */
export const COMPUTER_GENERATED =
    "This is a computer-generated invoice and needs no physical signature.";

export function sarohInvoicePaper(
    invoice: SarohInvoice & { lines: SarohInvoiceLine[] },
): PaperView {
    const money = (paise: number) => money2(paise, invoice.currency);
    const day = (d: Date) => paperDay(d.toISOString(), SAROH_TIMEZONE);
    const taxInvoice = Boolean(invoice.sellerGstin);
    const intra = invoice.taxType === "INTRA";
    const pos = stateLabel(invoice.placeOfSupply);
    const period =
        invoice.periodStart && invoice.periodEnd
            ? `For ${day(invoice.periodStart)} – ${day(invoice.periodEnd)}`
            : null;
    const legal = invoice.sellerLegalName;
    const lines = [...invoice.lines].sort((a, b) => a.position - b.position);

    return {
        title: taxInvoice ? "Tax invoice" : "Invoice",
        number: invoice.number,
        dates: `Issued ${day(invoice.issuedAt)}`,
        related: period,
        // The supplier is the legal entity; Saroh is what it sells.
        seller: {
            name: legal ?? invoice.sellerName,
            lines: [invoice.sellerAddress, invoice.sellerEmail].filter(
                (x): x is string => Boolean(x),
            ),
            tax: invoice.sellerGstin
                ? `GSTIN ${invoice.sellerGstin}${
                      stateLabel(invoice.sellerState)
                          ? ` · ${stateLabel(invoice.sellerState)}`
                          : ""
                  }`
                : "GSTIN not set",
            product: legal
                ? `${invoice.sellerName} is a product of ${legal}`
                : null,
        },
        // The buyer's state is the place of supply's, so the two can never
        // disagree (Rule 46(e)).
        billedTo: {
            name: invoice.billToName,
            detail:
                [invoice.billToAddress ?? invoice.billToEmail, pos]
                    .filter((x): x is string => Boolean(x))
                    .join("\n") || null,
            gstin: invoice.billToGstin,
        },
        placeOfSupply: `${pos ?? "—"}${intra ? " — CGST + SGST" : " — IGST"}`,
        hsnColumn: true,
        lines: lines.map((l) => {
            const sub = [
                `GST ${percent(l.gstRateBps)}`,
                l.quantity > 1 ? `${money(l.unitPaise)} each` : null,
                l.discountPaise > 0
                    ? `less ${money(l.discountPaise)} discount`
                    : null,
            ].filter(Boolean);
            return {
                description: l.description,
                sub: sub.join(" · "),
                hsn: spaced(l.sac),
                quantity: String(l.quantity),
                amount: money(l.taxablePaise),
            };
        }),
        sums: [
            ...(invoice.discountPaise > 0
                ? ([
                      ["Before discount", money(invoice.subtotalPaise)],
                      ["Discount", `−${money(invoice.discountPaise)}`],
                  ] as [string, string][])
                : []),
            ["Taxable value", money(invoice.taxablePaise)],
            ...sarohTaxRows(lines, intra).map(
                ([k, v]) => [k, money(v)] as [string, string],
            ),
        ],
        totalLabel: "Total",
        total: money(invoice.totalPaise),
        inclusive: null,
        signature: legal
            ? {
                  for: `For ${legal}`,
                  role: "Authorised signatory",
                  note: COMPUTER_GENERATED,
              }
            : null,
        footer: taxInvoice
            ? "Tax invoice under section 31, CGST Act. Reverse charge does not apply. Paid in full."
            : "Paid in full.",
    };
}

/** The PDF of a Saroh invoice read with its lines, and its file name. */
export async function renderSarohInvoicePdf(
    invoice: SarohInvoice & { lines: SarohInvoiceLine[] },
): Promise<{ file: Buffer; fileName: string }> {
    const file = await renderInvoicePdf(sarohInvoicePaper(invoice));
    return { file, fileName: pdfFileName(invoice.number) };
}
