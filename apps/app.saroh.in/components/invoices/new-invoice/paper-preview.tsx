import type { PaperStyle } from "@saroh/block-contract";
import { paperColours } from "@saroh/block-contract";
import { cn } from "@saroh/ui/lib/utils";
import type { CSSProperties, ReactNode } from "react";

import { ViewerDate } from "@/components/shared/viewer-date";
import { formatMoney } from "@/lib/format/money";
import type { Place, PreviewSeller } from "@/lib/invoices/new-invoice";
import type { PreviewSums } from "@/lib/invoices/new-invoice-lines";
import { halfRate, lineRateWords } from "@/lib/invoices/new-invoice-lines";

/** The parts of the paper, named for the editor that comes next (U15). */
export type PaperPart =
    "seller" | "number" | "buyer" | "supply" | "lines" | "sums" | "footer";

/**
 * "How it will look" (INVNewA, U14 #1126): the paper at a reduced size,
 * drawn from what is typed, in the style and colour it will go out in
 * (DEC-173, U6 #1118): Classic, plain and printable, with the colour on
 * the title and the heavy rule; Band, the colour across the top with the
 * seller and the number on it; Compact, smaller rows with the seller and
 * the buyer side by side. The colours are the shared rule's
 * (`paperColours`), so the preview reads as the PDF does.
 *
 * Its figures are a preview of the API's (`previewSums`); the invoice the
 * API prices, and freezes at issue, is the truth.
 *
 * Every part carries `data-part`: the seam for editing on the paper (U15),
 * which opens a part's editor from it. Nothing here is pressable yet.
 */
export function PaperPreview({
    seller,
    registered,
    currency,
    zone,
    buyer,
    place,
    sums,
    dueAt,
    style,
    colour,
}: {
    seller: PreviewSeller;
    registered: boolean;
    currency: string;
    /** The business's zone: the paper's dates are its. */
    zone: string;
    buyer: { name: string | null; address: string; gstin: string };
    place: Place | null;
    sums: PreviewSums;
    /** Null for On receipt. */
    dueAt: string | null;
    style: PaperStyle;
    colour: string | null;
}) {
    const colours = paperColours(style, colour);
    const money = (cents: number) => formatMoney(cents, currency);
    const compact = style === "COMPACT";
    // Every rated line at 0%: a bill of supply, with no tax rows (D15).
    const exempt =
        registered &&
        sums.lines.length > 0 &&
        sums.lines.every((l) => l.rate !== null && Number(l.rate) === 0);
    const title = !registered
        ? "Invoice"
        : exempt
          ? "Bill of supply"
          : "Tax invoice";
    const gstRows = registered && sums.taxed && !exempt;
    const rate = sums.oneRate;
    const tax: [string, number][] = gstRows
        ? sums.inter
            ? [[rate ? `IGST ${rate}%` : "IGST", sums.igstCents]]
            : [
                  [rate ? `CGST ${halfRate(rate)}%` : "CGST", sums.cgstCents],
                  [rate ? `SGST ${halfRate(rate)}%` : "SGST", sums.sgstCents],
              ]
        : [];
    const hsnColumn = registered && sums.lines.some((l) => l.hsn);
    const accent: CSSProperties | undefined = colours.coloured
        ? { color: colours.accent }
        : undefined;
    const rule: CSSProperties | undefined = colours.coloured
        ? { borderColor: colours.accent }
        : undefined;
    const band = colours.band;

    const sellerBlock = (
        <div data-part="seller" className="min-w-0">
            {seller.logo ? (
                // eslint-disable-next-line @next/next/no-img-element -- a tenant's own image, outside next/image's allowlist
                <img
                    src={seller.logo}
                    alt=""
                    className="mb-1.5 size-8 rounded-md object-cover"
                />
            ) : null}
            <p
                className={cn(
                    "font-display font-semibold tracking-[-0.02em]",
                    compact ? "text-[14px]" : "text-[16px]",
                )}
            >
                {seller.name}
            </p>
            <p
                className={cn(
                    "mt-0.5 text-[11px] leading-[1.45]",
                    band ? "opacity-85" : "text-muted-foreground",
                )}
            >
                {seller.address ? (
                    <span className="block">{seller.address}</span>
                ) : null}
                {registered
                    ? `GSTIN ${seller.gstin ?? ""}${seller.state ? ` · ${seller.state}` : ""}`
                    : "Not registered for GST"}
            </p>
        </div>
    );

    const numberBlock = (
        <div data-part="number" className="shrink-0 text-right">
            <p
                className={cn("label", band && "!text-current")}
                style={band ? undefined : accent}
            >
                {title}
            </p>
            <p className="mt-0.5 font-mono text-[12px]">Number when issued</p>
            <p
                className={cn(
                    "mt-0.5 text-[11px]",
                    band ? "opacity-85" : "text-muted-foreground",
                )}
            >
                {dueAt ? (
                    <>
                        Due{" "}
                        <ViewerDate
                            iso={dueAt}
                            variant="dayMonth"
                            timeZone={zone}
                        />
                    </>
                ) : (
                    "Due on receipt"
                )}
            </p>
        </div>
    );

    const buyerBlock = (
        <div data-part="buyer" className="min-w-0">
            <p className="label" style={accent}>
                Billed to
            </p>
            <p className="mt-0.5 text-[12.5px] font-semibold">
                {buyer.name ?? "Who it's for"}
            </p>
            {buyer.address ? (
                <p className="text-[11px] leading-[1.45] text-muted-foreground">
                    {buyer.address}
                </p>
            ) : null}
            {buyer.gstin ? (
                <p className="mt-0.5 font-mono text-[11px]">
                    GSTIN {buyer.gstin}
                </p>
            ) : null}
        </div>
    );

    const supplyBlock =
        registered && !exempt ? (
            <div data-part="supply" className="min-w-0">
                <p className="label" style={accent}>
                    Place of supply
                </p>
                <p className="mt-0.5 text-[11.5px]">
                    {place ? `${place.name} (${place.code})` : "Not set"}
                    {sums.inter ? " · IGST" : " · CGST + SGST"}
                </p>
            </div>
        ) : null;

    return (
        <article
            aria-label="How it will look"
            data-style={style}
            className={cn(
                "invoice-paper overflow-hidden rounded-[6px] border border-border text-[12px] shadow-[0_6px_18px_hsl(60_4%_11%/0.08)] [overflow-wrap:anywhere]",
                compact ? "px-4 py-3.5" : "px-5 py-[18px]",
            )}
        >
            {band ? (
                <header
                    data-band={band.tone.toLowerCase()}
                    className={cn(
                        "-mx-5 -mt-[18px] mb-3 flex flex-wrap items-start justify-between gap-3 px-5 py-4",
                        compact && "-mx-4 -mt-3.5 px-4 py-3",
                    )}
                    style={{ backgroundColor: band.fill, color: band.text }}
                >
                    {sellerBlock}
                    {numberBlock}
                </header>
            ) : compact ? (
                <header
                    className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-start gap-3 border-b-2 border-foreground pb-2.5"
                    style={rule}
                >
                    {sellerBlock}
                    {buyerBlock}
                    {numberBlock}
                </header>
            ) : (
                <header
                    className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-foreground pb-3"
                    style={rule}
                >
                    {sellerBlock}
                    {numberBlock}
                </header>
            )}

            <div
                className={cn(
                    "flex flex-wrap gap-4",
                    compact ? "py-2" : "py-3",
                )}
            >
                {compact && !band ? null : buyerBlock}
                {supplyBlock}
            </div>

            <div data-part="lines" className="border-t border-border">
                {sums.lines.length === 0 ? (
                    <p className="py-3 text-[11.5px] text-muted-foreground">
                        The lines you write show here.
                    </p>
                ) : (
                    sums.lines.map((l, i) => (
                        <Row
                            key={i}
                            compact={compact}
                            what={l.description}
                            sub={[
                                lineRateWords(l.rate),
                                hsnColumn && l.hsn ? `HSN ${l.hsn}` : null,
                                `${l.quantity} × ${money(l.unitCents)}`,
                            ]}
                            amount={money(l.amountCents)}
                        />
                    ))
                )}
            </div>

            <div data-part="sums" className="flex justify-end pt-2">
                <div className="w-full max-w-[240px]">
                    {gstRows ? (
                        <SumRow label="Taxable value">
                            {money(sums.taxableCents)}
                        </SumRow>
                    ) : null}
                    {tax.map(([label, cents]) => (
                        <SumRow key={label} label={label}>
                            {money(cents)}
                        </SumRow>
                    ))}
                    <div
                        className={cn(
                            "flex border-t-2 border-foreground pt-1.5 text-[14px] font-bold",
                            tax.length > 0 && "mt-1",
                        )}
                        style={rule}
                    >
                        <span className="flex-1">Total</span>
                        <span className="tabular-nums">
                            {money(sums.totalCents)}
                        </span>
                    </div>
                </div>
            </div>

            <p
                data-part="footer"
                className="mt-3 border-t border-dashed border-border-strong pt-2 text-[10.5px] leading-[1.5] text-muted-foreground"
            >
                {registered
                    ? exempt
                        ? "Bill of supply under section 31(3)(c), CGST Act. Supply exempt from GST."
                        : "Tax invoice under section 31, CGST Act. Reverse charge does not apply."
                    : `${seller.name} is not registered for GST, so no tax is charged.`}
            </p>
        </article>
    );
}

function Row({
    compact,
    what,
    sub,
    amount,
}: {
    compact: boolean;
    what: string;
    sub: (string | null)[];
    amount: string;
}) {
    const note = sub.filter(Boolean).join(" · ");
    return (
        <div
            className={cn(
                "flex items-baseline gap-2 border-b border-border/60",
                compact ? "py-1 text-[11.5px]" : "py-[7px] text-[12px]",
            )}
        >
            <span className="min-w-0 flex-1">
                {what}
                {note ? (
                    <span className="block text-[10.5px] text-muted-foreground">
                        {note}
                    </span>
                ) : null}
            </span>
            <span className="font-semibold tabular-nums">{amount}</span>
        </div>
    );
}

function SumRow({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex py-[2px] text-[11.5px]">
            <span className="flex-1">{label}</span>
            <span className="tabular-nums">{children}</span>
        </div>
    );
}
