"use client";

import { showError } from "@saroh/ui/toast";
import type { ReactNode } from "react";
import { useState } from "react";

import { useShareFlow } from "@/components/invoices/details/flows";
import type { ShareMessageKind } from "@/lib/invoices/detail-actions";
import type { InvoiceDetails } from "@/lib/invoices/details";
import { loadInvoiceDetails } from "@/lib/invoices/details-actions";

/**
 * A row's own Remind on the Invoices list (DEC-173, U8's slot, U12 #1124):
 * U11's share sheet on the reminder message, opened from the list without
 * opening the invoice. The invoice's details are read first (the share
 * sheet reads its number, send flags and phone from them), then the sheet
 * opens through `useShareFlow`, the same seam the details view uses.
 */
export function useRowShare({ onDone }: { onDone?: () => void } = {}): {
    open: (invoiceId: string, kind?: ShareMessageKind) => void;
    /** The id being read, so its button can say so. */
    loading: string | null;
    overlays: ReactNode;
} {
    const [loading, setLoading] = useState<string | null>(null);
    const [shown, setShown] = useState<{
        details: InvoiceDetails;
        kind?: ShareMessageKind;
        /** A new opening of the same invoice starts the sheet again. */
        at: number;
    } | null>(null);

    async function open(invoiceId: string, kind?: ShareMessageKind) {
        if (loading) return;
        setLoading(invoiceId);
        try {
            const res = await loadInvoiceDetails(invoiceId);
            if (!res.ok) {
                showError(res.error);
                return;
            }
            setShown({ details: res.data, kind, at: Date.now() });
        } catch {
            showError("That invoice could not be loaded.");
        } finally {
            setLoading(null);
        }
    }

    return {
        open: (id, kind) => void open(id, kind),
        loading,
        overlays: shown ? (
            <RowShareSheet
                key={shown.at}
                details={shown.details}
                kind={shown.kind}
                onDone={() => onDone?.()}
            />
        ) : null,
    };
}

/** The share flow for one invoice's details, opened as soon as it is drawn. */
function RowShareSheet({
    details,
    kind,
    onDone,
}: {
    details: InvoiceDetails;
    kind?: ShareMessageKind;
    onDone: () => void;
}) {
    const share = useShareFlow({ details, onDone });
    // Opened once, on the message asked for, on WhatsApp: set while drawing,
    // as the sheet's own state is (no effect to wait a frame for).
    const [opened, setOpened] = useState(false);
    if (!opened) {
        setOpened(true);
        share.open(kind, "whatsapp");
    }
    return <>{share.overlays}</>;
}
