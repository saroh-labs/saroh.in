"use client";

import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { runAction } from "@/lib/api/run-action";
import { writeInvoiceAgain } from "@/lib/invoices/actions";

/**
 * "Write again" on a void invoice nobody wrote again (DEC-173, U13): the
 * API makes a draft with the same person, reason for being and lines, and
 * the draft opens in the editor to fix — as Void and write again always
 * did. Nothing is asked: it destroys nothing, and the draft can be
 * deleted. The details view (U9) and today's page call `run`; `busy`
 * keeps a second press from making a second draft (the API refuses one
 * too).
 */
export function useWriteAgain() {
    const router = useRouter();
    const [busy, setBusy] = useState(false);

    async function run(invoice: { id: string; number: string | null }) {
        if (busy) return;
        const res = await runAction(() => writeInvoiceAgain(invoice.id), {
            setBusy,
        });
        if (!res) return;
        if (!res.ok) return showError(res.error);
        showSuccess(
            `${invoice.number ?? "The invoice"} written again. A draft with its lines is open.`,
        );
        router.push(`/billing/invoices/${res.data.id}/edit`);
    }

    return { run, busy };
}
