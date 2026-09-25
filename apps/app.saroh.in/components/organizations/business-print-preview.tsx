/**
 * "How it prints" ("Saroh Settings" design): the top of an invoice as the
 * business's details put it, live while a section is being edited, so an edit
 * is judged by what a customer will read rather than by the field it is in.
 *
 * Paper-coloured on purpose — it stands for a printed page, not a card — so
 * it keeps the design's fixed paper and ink in dark theme as well.
 */
export function BusinessPrintPreview({
    live,
    registered,
    number,
    legalName,
    tradingAs,
    address,
    gstin,
    stateName,
    contact,
    deliverySac,
    deliveryRate,
}: {
    /** A section is being edited: say the preview shows the unsaved edit. */
    live: boolean;
    registered: boolean;
    number: string;
    legalName: string;
    /** The business name, when the legal name differs from it. */
    tradingAs: string | null;
    address: string;
    gstin: string;
    stateName: string;
    contact: string;
    deliverySac: string;
    deliveryRate: string;
}) {
    return (
        <aside
            aria-label="How it prints"
            className="grid min-w-[260px] flex-[0_1_320px] gap-2 self-start min-[1100px]:sticky min-[1100px]:top-4"
        >
            <div className="flex items-baseline gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    How it prints
                </span>
                {live ? (
                    <span className="text-[11.5px] text-brand-subtle-foreground">
                        Showing your unsaved edit
                    </span>
                ) : null}
            </div>
            <div className="rounded-[10px] border border-border bg-[#FFFDF6] px-[18px] pb-4 pt-[18px] text-[12px] leading-normal text-[#1C1C1A] shadow-[0_1px_2px_rgba(28,28,26,0.06)]">
                <div className="mb-2.5 flex items-baseline gap-2 border-b border-[rgba(28,28,26,0.12)] pb-2">
                    <span className="text-[10.5px] font-bold uppercase tracking-[0.12em]">
                        {registered ? "Tax invoice" : "Invoice"}
                    </span>
                    <span className="ml-auto font-mono text-[11px]">
                        {number}
                    </span>
                </div>
                <div className="font-display text-[15px] font-semibold tracking-[-0.01em]">
                    {legalName}
                </div>
                {tradingAs ? (
                    <div className="text-[#5C5850]">Trading as {tradingAs}</div>
                ) : null}
                <div className="mt-1 whitespace-pre-line text-[#43403A]">
                    {address || "No registered address yet"}
                </div>
                {registered ? (
                    <>
                        <div className="mt-1.5 font-mono text-[11px]">
                            GSTIN {gstin || "—"}
                        </div>
                        <div className="text-[#5C5850]">
                            Place of supply rules from {stateName || "—"}
                        </div>
                    </>
                ) : null}
                {contact ? (
                    <div className="mt-1.5 text-[#5C5850]">{contact}</div>
                ) : null}
                {registered ? (
                    <div className="mt-3 flex gap-2 border-t border-dashed border-[rgba(28,28,26,0.2)] pt-2 text-[11.5px]">
                        <span className="flex-1">Delivery</span>
                        <span className="font-mono">
                            SAC {deliverySac || "—"}
                        </span>
                        <span>GST {deliveryRate}%</span>
                    </div>
                ) : null}
            </div>
            <p className="text-pretty text-[11.5px] leading-normal text-muted-foreground">
                {registered
                    ? `A sale inside ${stateName || "your state"} splits into CGST + SGST; to anywhere else it's IGST.`
                    : "Not GST-registered, so invoices carry no GSTIN and no tax split."}
            </p>
        </aside>
    );
}
