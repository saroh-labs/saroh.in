import type { PaperStyle } from "@saroh/block-contract";
import { paperColours } from "@saroh/block-contract";
import { cn } from "@saroh/ui/lib/utils";
import { Lock } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import { ViewerDate } from "@/components/shared/viewer-date";
import { formatMoney } from "@/lib/format/money";
import type { Place, PreviewSeller } from "@/lib/invoices/new-invoice";
import type { PreviewSums } from "@/lib/invoices/new-invoice-lines";
import { halfRate, lineRateWords } from "@/lib/invoices/new-invoice-lines";

/** The parts of the paper, each named by `data-part`. */
export type PaperPart =
    "seller" | "number" | "buyer" | "supply" | "lines" | "sums" | "footer";

/** A part of the paper that opens an editor, or says where it comes from. */
export type PaperTarget =
    | { part: "seller" }
    | { part: "number" }
    | { part: "buyer" }
    | { part: "due" }
    | { part: "line"; index: number }
    | { part: "notes" };

/**
 * Editing on the paper (U15 #1127): each part is wrapped in the control
 * that opens its editor, the lines still being written show so they can be
 * finished, and "Add a line" sits under the lines. The GST fields a tax
 * invoice must carry (CGST Rule 46) are labelled with where they come
 * from; none has a way to be taken off.
 */
export interface PaperEditing {
    /** Wraps a part in the control that opens it. */
    part: (target: PaperTarget, label: string, node: ReactNode) => ReactNode;
    /** Lines being written that can't be priced yet. */
    unfinished: { index: number; description: string }[];
    /** "Add a line · type or pick a product". */
    addLine: ReactNode;
}

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
 * Every part carries `data-part`. Given `editing` (U15 #1127), each part
 * opens its editor, and the Rule 46 parts carry their labels ("Next in
 * series", "Set from the customer", "Required"). Without it nothing here is
 * pressable: the form's "How it will look" and "See it as Vivek will".
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
    howToPay = null,
    editing,
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
    /** "How to pay us", as unpaid paper prints it; null when none is set. */
    howToPay?: string[] | null;
    editing?: PaperEditing;
}) {
    const wrap = (target: PaperTarget, label: string, node: ReactNode) =>
        editing ? editing.part(target, label, node) : node;
    // A tax invoice's own particulars say where they come from.
    const tag = (words: string) =>
        editing && registered ? <LockTag>{words}</LockTag> : null;
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

    const sellerBlock = wrap(
        { part: "seller" },
        "The seller: from Settings › Business",
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
            {tag("Seller")}
        </div>,
    );

    const dueLine = (
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
    );

    const numberBlock = (
        <div data-part="number" className="shrink-0 text-right">
            {wrap(
                { part: "number" },
                "The number: the next in your series, given on issue",
                <div>
                    <p
                        className={cn("label", band && "!text-current")}
                        style={band ? undefined : accent}
                    >
                        {title}
                    </p>
                    <p className="mt-0.5 font-mono text-[12px]">
                        Number when issued
                    </p>
                    {tag("Next in series")}
                </div>,
            )}
            {wrap({ part: "due" }, "Change when it's due", dueLine)}
        </div>
    );

    const buyerBlock = wrap(
        { part: "buyer" },
        `Change who it's billed to${buyer.name ? `: ${buyer.name}` : ""}`,
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
            {tag("Name, address, GSTIN")}
        </div>,
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
                {tag("Set from the customer")}
            </div>
        ) : null;

    return (
        <article
            aria-label={
                editing
                    ? "The invoice: press a part to change it"
                    : "How it will look"
            }
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
                {sums.lines.length === 0 && !editing?.unfinished.length ? (
                    <p className="py-3 text-[11.5px] text-muted-foreground">
                        The lines you write show here.
                    </p>
                ) : (
                    sums.lines.map((l) => (
                        <div key={l.index}>
                            {wrap(
                                { part: "line", index: l.index },
                                `Change line ${l.index + 1}: ${l.description}`,
                                <Row
                                    compact={compact}
                                    what={l.description}
                                    sub={[
                                        lineRateWords(l.rate),
                                        hsnColumn && l.hsn
                                            ? `HSN ${l.hsn}`
                                            : null,
                                        `${l.quantity} × ${money(l.unitCents)}`,
                                    ]}
                                    amount={money(l.amountCents)}
                                />,
                            )}
                        </div>
                    ))
                )}
                {editing?.unfinished.map((l) => (
                    <div key={`open-${l.index}`} data-unfinished="">
                        {wrap(
                            { part: "line", index: l.index },
                            `Finish line ${l.index + 1}${l.description ? `: ${l.description}` : ""}`,
                            <Row
                                compact={compact}
                                what={l.description || "A new line"}
                                sub={["Set its quantity and price"]}
                                amount=""
                            />,
                        )}
                    </div>
                ))}
                {editing ? (
                    <div className="py-1.5">{editing.addLine}</div>
                ) : null}
            </div>

            <div data-part="sums" className="flex justify-end pt-2">
                <div className="w-full max-w-[240px]">
                    {gstRows ? (
                        <SumRow label="Taxable value">
                            {money(sums.taxableCents)}
                        </SumRow>
                    ) : null}
                    {gstRows ? tag("Per rate") : null}
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

            {howToPay?.length || editing
                ? wrap(
                      { part: "notes" },
                      "How to pay you: printed on every unpaid invoice",
                      <section
                          data-part="notes"
                          aria-label="How to pay us"
                          className="mt-3 text-[11px] leading-[1.5]"
                      >
                          <p className="label" style={accent}>
                              How to pay us
                          </p>
                          {howToPay?.length ? (
                              howToPay.map((line) => <p key={line}>{line}</p>)
                          ) : (
                              <p className="text-muted-foreground">
                                  Add your UPI ID or bank details, and every
                                  unpaid invoice carries them.
                              </p>
                          )}
                      </section>,
                  )
                : null}

            <div
                data-part="footer"
                className="mt-3 border-t border-dashed border-border-strong pt-2 text-[10.5px] leading-[1.5] text-muted-foreground"
            >
                <p>
                    {registered
                        ? exempt
                            ? "Bill of supply under section 31(3)(c), CGST Act. Supply exempt from GST."
                            : "Tax invoice under section 31, CGST Act. Reverse charge does not apply."
                        : `${seller.name} is not registered for GST, so no tax is charged.`}
                </p>
                {tag("Required")}
            </div>
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

/**
 * A Rule 46 particular's label on the paper being edited ("Required", "Set
 * from the customer"): it is there on every tax invoice, whatever the
 * style, and has no way to be taken off.
 */
function LockTag({ children }: { children: ReactNode }) {
    return (
        <span
            data-locked=""
            className="mt-1 inline-flex items-center gap-1 rounded-full border border-dashed border-border-strong bg-card px-1.5 py-px text-[10px] font-medium normal-case tracking-normal text-muted-foreground"
        >
            <Lock aria-hidden className="size-2.5" />
            {children}
        </span>
    );
}
