"use client";

import { showError, showSuccess } from "@saroh/ui/toast";

import { shareInvoice } from "@/lib/invoices/actions";
import type { ShareResult } from "@/lib/invoices/service";
import { SHARE_RECEIPT_ON_WHATSAPP } from "@/lib/invoices/words";

/**
 * Open WhatsApp with the invoice's message typed in (DEC-173): a receipt
 * after a payment, or a reminder after a cheque bounced. Click-to-chat
 * through U5's share call, which logs it and answers with the `wa.me`
 * link; Saroh sends nothing itself.
 *
 * Call it from the press itself: the tab is opened before the call goes,
 * so a browser that only lets a press open a tab doesn't block it, and it
 * is closed again when the share is refused. With no phone on file the
 * message opens in WhatsApp's own chooser.
 */
export async function openWhatsAppShare(
    invoiceId: string,
    kind: ShareResult["kind"],
    /** A tab opened by the press already, for a share after another call. */
    opened?: Window | null,
): Promise<boolean> {
    const tab =
        opened !== undefined
            ? opened
            : typeof window !== "undefined"
              ? window.open("", "_blank")
              : null;
    let res: Awaited<ReturnType<typeof shareInvoice>>;
    try {
        res = await shareInvoice(invoiceId, { channel: "WHATSAPP", kind });
    } catch {
        tab?.close();
        showError("Couldn't open WhatsApp. Try again.");
        return false;
    }
    if (!res.ok) {
        tab?.close();
        showError(res.error);
        return false;
    }
    const url =
        res.data.whatsappUrl ??
        (res.data.text
            ? `https://wa.me/?text=${encodeURIComponent(res.data.text)}`
            : null);
    if (!url) {
        tab?.close();
        showError("Couldn't open WhatsApp. Try again.");
        return false;
    }
    if (tab) {
        tab.opener = null;
        tab.location.href = url;
    } else {
        window.open(url, "_blank", "noopener");
    }
    return true;
}

/**
 * After the Undo window, where the receipt can't be emailed (owner, 20
 * Oct): one toast with "Share receipt on WhatsApp". Returns a way to take
 * the offer back, for Undo.
 */
export function offerWhatsAppReceipt(
    invoiceId: string,
    who: string,
    afterMs: number,
): () => void {
    const timer = setTimeout(() => {
        showSuccess(`Receipt ready for ${who}.`, undefined, {
            label: SHARE_RECEIPT_ON_WHATSAPP,
            onClick: () => void openWhatsAppShare(invoiceId, "RECEIPT"),
        });
    }, afterMs);
    return () => clearTimeout(timer);
}
