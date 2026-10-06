import type { SarohInvoice, SarohInvoiceLine } from "@saroh/database";

import { stateName } from "../invoices/gst-states";
import type { PaperView } from "../invoices/invoice-paper-view";
import { paperDay, paperMoney } from "../invoices/invoice-paper-view";
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

export function sarohInvoicePaper(
    invoice: SarohInvoice & { lines: SarohInvoiceLine[] },
): PaperView {
    const money = (paise: number) =>
        paperMoney(paiseToRupees(paise), invoice.currency);
    const day = (d: Date) => paperDay(d.toISOString(), SAROH_TIMEZONE);
    const taxInvoice = Boolean(invoice.sellerGstin);
    const intra = invoice.taxType === "INTRA";
    const pos = stateLabel(invoice.placeOfSupply);
    const period =
        invoice.periodStart && invoice.periodEnd
            ? `For ${day(invoice.periodStart)} – ${day(invoice.periodEnd)}`
            : null;

    return {
        title: taxInvoice ? "Tax invoice" : "Invoice",
        number: invoice.number,
        dates: `Issued ${day(invoice.issuedAt)}`,
        related: period,
        seller: {
            name: invoice.sellerName,
            lines: [
                invoice.sellerLegalName,
                invoice.sellerAddress,
                invoice.sellerEmail,
            ].filter((x): x is string => Boolean(x)),
            tax: invoice.sellerGstin
                ? `GSTIN ${invoice.sellerGstin}${
                      stateLabel(invoice.sellerState)
                          ? ` · ${stateLabel(invoice.sellerState)}`
                          : ""
                  }`
                : "GSTIN not set",
        },
        billedTo: {
            name: invoice.billToName,
            detail: invoice.billToAddress ?? invoice.billToEmail ?? null,
            gstin: invoice.billToGstin,
        },
        placeOfSupply: `${pos ?? "—"}${intra ? " — CGST + SGST" : " — IGST"}`,
        hsnColumn: true,
        lines: [...invoice.lines]
            .sort((a, b) => a.position - b.position)
            .map((l) => {
                const sub = [
                    `GST ${l.gstRateBps / 100}%`,
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
            ...(intra
                ? ([
                      ["CGST", money(invoice.cgstPaise)],
                      ["SGST", money(invoice.sgstPaise)],
                  ] as [string, string][])
                : ([["IGST", money(invoice.igstPaise)]] as [string, string][])),
        ],
        totalLabel: "Total",
        total: money(invoice.totalPaise),
        inclusive: null,
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
