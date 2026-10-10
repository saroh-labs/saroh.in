import type { QrCodeView } from "@/lib/qr/types";

import type { QrStyleLock } from "./qr-style-lock";

/**
 * SLOT — "Ready to print" (plan U6, not built yet).
 *
 * The design draws four print-ready PDFs here, between the maker and "Your
 * QR codes": counter standee (A5), table tent, mirror sticker, visiting
 * card back. They need the API's PDF route, which is U6's. Until it lands
 * this draws nothing, so there are no buttons that do nothing.
 *
 * U6 fills in this component's body and nothing else needs to move:
 * `QrShare` already renders it in the design's place and hands it what the
 * section needs.
 */
export interface QrPrintSlotProps {
    siteId: string;
    /** The saved code the maker holds; null while it is only a sample. */
    code: QrCodeView | null;
    /**
     * The plan leaves print files off. The design dims the section then
     * (its "lower block" at 0.45) and names the plans that have it.
     */
    lock: QrStyleLock | null;
    business: { name: string };
}

export function QrPrintSlot(_props: QrPrintSlotProps) {
    return null;
}
