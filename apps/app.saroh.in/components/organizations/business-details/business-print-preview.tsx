import { PreviewPanel } from "@/components/organizations/business-settings/preview-panel";

/**
 * "How it prints" ("Saroh Settings" design): the top of an invoice as the
 * business's details put it. Beside the rows it shows what is saved; under
 * a sheet's fields (`in-sheet`) it follows the draft, so an edit is judged by
 * what a customer will read rather than by the field it is in.
 *
 * Paper-coloured on purpose — it stands for a printed page, not a card — so
 * it keeps the design's fixed paper and ink in dark theme as well.
 */
export function BusinessPrintPreview({
    placement = "beside",
    live,
    logoUrl,
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
    /** Beside the rows, or under a sheet's fields following the draft. */
    placement?: "beside" | "in-sheet";
    /** Drawn from a draft: say the preview shows the unsaved edit. */
    live: boolean;
    /** The logo printed above the legal name, when there is one. */
    logoUrl: string | null;
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
        <PreviewPanel
            label="How it prints"
            live={live}
            placement={placement}
            className="flex-[0_1_320px]"
        >
            <div className="rounded-[10px] border border-border bg-[#FFFDF6] px-[18px] pb-4 pt-[18px] text-[12px] leading-normal text-[#1C1C1A] shadow-[0_1px_2px_rgba(28,28,26,0.06)]">
                <div className="mb-2.5 flex items-baseline gap-2 border-b border-[rgba(28,28,26,0.12)] pb-2">
                    <span className="label">
                        {registered ? "Tax invoice" : "Invoice"}
                    </span>
                    <span className="ml-auto font-mono text-[11px]">
                        {number}
                    </span>
                </div>
                {logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a tenant's own image, outside next/image's allowlist
                    <img
                        src={logoUrl}
                        alt=""
                        className="mb-2 size-9 rounded-lg object-cover"
                    />
                ) : null}
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
                            GSTIN {gstin || "not set"}
                        </div>
                        <div className="text-[#5C5850]">
                            Place of supply rules from{" "}
                            {stateName || "your state"}
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
                            SAC {deliverySac || "not set"}
                        </span>
                        <span>GST {deliveryRate}%</span>
                    </div>
                ) : null}
            </div>
            <p className="text-pretty text-[11.5px] leading-normal text-muted-foreground">
                {registered
                    ? `A sale inside ${stateName || "your state"} splits into CGST + SGST. To anywhere else it's IGST.`
                    : "Not GST-registered, so invoices carry no GSTIN and no tax split."}
            </p>
        </PreviewPanel>
    );
}
