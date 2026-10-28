"use client";

import { ConfirmDialog } from "@saroh/ui/confirm-dialog";
import { showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";

import { removeProfileAction } from "@/lib/billing-profile-actions";

/**
 * Remove a profile nothing uses (F6), in the one confirm. Its way out keeps
 * it; invoices Saroh already sent to it keep its details. A refusal stays
 * in the dialog with the API's reason.
 */
export function RemoveDialog({
    id,
    name,
    open,
    onClose,
}: {
    id: string;
    name: string;
    open: boolean;
    onClose: () => void;
}) {
    const router = useRouter();
    return (
        <ConfirmDialog
            open={open}
            onOpenChange={(o) => (o ? null : onClose())}
            title={`Remove ${name}?`}
            description="No business uses it, so nothing about your billing changes. Invoices Saroh already sent to it stay in your records and keep these details. This cannot be undone."
            confirmLabel="Remove profile"
            keepLabel="Keep profile"
            onConfirm={async () => {
                const res = await removeProfileAction(id).catch(() => null);
                if (!res) {
                    return {
                        ok: false,
                        error: "That couldn't be removed just now. Try again.",
                    };
                }
                if (!res.ok) return { ok: false, error: res.error };
                showSuccess(`${name} is removed.`);
                router.push("/account/billing-profiles");
                return true;
            }}
        />
    );
}
