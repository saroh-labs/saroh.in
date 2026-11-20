"use client";

export interface PriceSheetProps {
    siteId: string;
    /** The service whose price is being changed; null: the sheet is closed. */
    serviceId: string | null;
    onClose: () => void;
    /** The service's price changed in Services: redraw what shows it. */
    onSaved?: () => void;
}

/**
 * Change a service's price without leaving the editor (U46 stub; U48 fills
 * it as `fix/WXKPrice` and `fix/WXNPrice` draw it, on the owner's O1). The
 * inspector's From Services list (U47) opens it; the stub draws nothing.
 */
export function PriceSheet(_props: PriceSheetProps) {
    return null;
}
