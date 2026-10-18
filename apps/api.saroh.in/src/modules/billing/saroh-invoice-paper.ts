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

/** "₹1.00": Saroh's paper always shows the paise. */
function money2(paise: number, currency: string): string {
    return new Intl.NumberFormat("en-IN", {
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
 * half each for CGST and SGST within the state ("CGST @ 9%"), the whole as
 * IGST across states ("IGST @ 18%"). Lines at the same rate share a row; a
 * paper with lines at two rates shows a row per rate. Never a typed rate:
 * always the line's own. The amounts are the lines' stored tax, summed.
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
            rows.push([`CGST @ ${percent(bps / 2)}`, r.c]);
            rows.push([`SGST @ ${percent(bps / 2)}`, r.s]);
        } else {
            rows.push([`IGST @ ${percent(bps)}`, r.i]);
        }
    }
    return rows;
}

export type SarohPaymentStatus = "Paid" | "Due";

/**
 * Every source writes its invoice with a charge the provider reported
 * taken (the webhook, or the business's return checked with the
 * provider): a failed charge writes none (`paymentFailedInTx`). So each
 * of today's sources is paid when written. A source that bills before it
 * is paid must not be added here, and then reads "Due".
 */
const PAID_WHEN_WRITTEN = new Set(["NEW", "UPGRADE", "SCHEDULED", "RENEWAL"]);

/** Whether the invoice's payment has been received, from how it was written. */
export function sarohPaymentStatus(
    invoice: Pick<SarohInvoice, "source">,
): SarohPaymentStatus {
    return PAID_WHEN_WRITTEN.has(invoice.source) ? "Paid" : "Due";
}

/**
 * None of Saroh's supplies is under reverse charge: Saroh charges and pays
 * the GST on every plan, add-on and first month itself. The model keeps no
 * reverse-charge flag because no Saroh charge can be one.
 */
const REVERSE_CHARGE = "No";

/** The words under the total (Rule 46(q); see `PRICING_ROLLOUT.md`). */
export const ELECTRONIC_INVOICE = {
    role: "Electronically generated tax invoice",
    note: "This invoice is electronically generated and does not require a physical signature.",
} as const;

export function sarohInvoicePaper(
    invoice: SarohInvoice & { lines: SarohInvoiceLine[] },
): PaperView {
    const money = (paise: number) => money2(paise, invoice.currency);
    const day = (d: Date) => paperDay(d.toISOString(), SAROH_TIMEZONE);
    const taxInvoice = Boolean(invoice.sellerGstin);
    const intra = invoice.taxType === "INTRA";
    const pos = stateLabel(invoice.placeOfSupply);
    const legal = invoice.sellerLegalName;
    const lines = [...invoice.lines].sort((a, b) => a.position - b.position);
    const status = `Payment status: ${sarohPaymentStatus(invoice)}`;

    return {
        title: taxInvoice ? "Tax invoice" : "Invoice",
        number: invoice.number,
        dates: `Issue date: ${day(invoice.issuedAt)}`,
        related:
            invoice.periodStart && invoice.periodEnd
                ? // Two lines: the dates never break inside the header's width.
                  `Subscription period:\n${day(invoice.periodStart)} – ${day(invoice.periodEnd)}`
                : null,
        status,
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
        // disagree (Rule 46(e)). Their email and phone, when the invoice
        // has them (17 Oct 2026), under the address.
        billedTo: {
            name: invoice.billToName,
            detail:
                [
                    invoice.billToAddress,
                    invoice.billToEmail,
                    invoice.billToPhone,
                    pos ? `State: ${pos}` : null,
                ]
                    .filter((x): x is string => Boolean(x))
                    .join("\n") || null,
            gstin: invoice.billToGstin,
        },
        placeOfSupply: pos ?? "—",
        hsnColumn: true,
        table: { code: "SAC", rate: true, amount: "TAXABLE VALUE" },
        lines: lines.map((l) => {
            const sub = [
                `GST @ ${percent(l.gstRateBps)}`,
                l.discountPaise > 0
                    ? `less ${money(l.discountPaise)} discount`
                    : null,
            ].filter(Boolean);
            return {
                description: l.description,
                sub: sub.join(" · "),
                hsn: l.sac ?? "",
                quantity: String(l.quantity),
                rate: money(l.unitPaise),
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
                  role: ELECTRONIC_INVOICE.role,
                  note: ELECTRONIC_INVOICE.note,
              }
            : null,
        footer: [
            taxInvoice
                ? "Tax invoice issued under Section 31 of the CGST Act."
                : null,
            `Reverse charge: ${REVERSE_CHARGE}`,
            status,
        ]
            .filter(Boolean)
            .join("\n"),
    };
}

/** The PDF of a Saroh invoice read with its lines, and its file name. */
export async function renderSarohInvoicePdf(
    invoice: SarohInvoice & { lines: SarohInvoiceLine[] },
): Promise<{ file: Buffer; fileName: string }> {
    const file = await renderInvoicePdf(sarohInvoicePaper(invoice));
    return { file, fileName: pdfFileName(invoice.number) };
}
