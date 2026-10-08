import { CANT_MARK_PAID } from "@/lib/organizations/permits";

import { sendLabel } from "./send";
import type { InvoiceStanding } from "./service";

/**
 * Invoice Detail's buttons, by status (after "Saroh Invoice Detail"). Pure,
 * so which buttons a state gets is tested rather than read off a page; the
 * screen maps each `id` to what it does.
 *
 * A draft is sent, issued, edited or deleted; an unpaid one is sent or
 * reminded, gets its pay link copied, is marked paid, printed or
 * cancelled; a paid one is printed or refunded. "Copy pay link" is offered
 * only where the link takes payment (`payOnline`, DEC-070): without it the
 * link only shows the invoice, Send says "Send invoice", and "Copy view
 * link" hands the merchant that link to send themselves (#833).
 */
export type DetailActionId =
    | "draftSend"
    | "issue"
    | "edit"
    | "delete"
    | "send"
    | "remind"
    | "copyLink"
    | "copyViewLink"
    | "pay"
    | "print"
    | "pdf"
    | "cancel"
    | "refund"
    | "refundOrder";

export interface DetailAction {
    id: DetailActionId;
    label: string;
    primary?: boolean;
    danger?: boolean;
    disabled?: boolean;
    /** Why it is disabled, said beside it (FB-1). */
    reason?: string;
}

export interface DetailActionState {
    standing: InvoiceStanding;
    /** A credit note: nothing is owed on it. */
    credit: boolean;
    /** An order's paper: its money moves on the order. */
    fromOrder: boolean;
    canWrite: boolean;
    /** The API names a channel to send it by (D17). */
    sendable: boolean;
    /** It went once already, so the next is a reminder. */
    reminding: boolean;
    /** One reminder a day: the next can't go yet. */
    reminderWaits: boolean;
    /** Its link takes payment (`payOnline`). */
    payOnline: boolean;
    /** An autopay charge is under way (D13): no link. */
    charging: boolean;
    /** Issued paper has a PDF; a draft has none. */
    hasPdf: boolean;
    /** A pay link is being made. */
    linkBusy: boolean;
    /** The PDF is being made. */
    pdfBusy: boolean;
}

/** Whether money is owed on it here, rather than on an order. */
export function owedHere(
    s: Pick<DetailActionState, "standing" | "credit" | "fromOrder">,
): boolean {
    return (
        (s.standing === "ISSUED" || s.standing === "OVERDUE") &&
        !s.credit &&
        !s.fromOrder
    );
}

export function detailActions(s: DetailActionState): DetailAction[] {
    const send = sendLabel(s.payOnline);
    const pdf: DetailAction[] = s.hasPdf
        ? [
              {
                  id: "pdf",
                  label: s.pdfBusy ? "Making the PDF…" : "Download PDF",
                  disabled: s.pdfBusy,
              },
          ]
        : [];
    const owed = owedHere(s);

    if (s.canWrite && s.standing === "DRAFT") {
        return [
            ...(s.sendable
                ? [{ id: "draftSend", label: send, primary: true } as const]
                : []),
            { id: "issue", label: "Issue it", primary: !s.sendable },
            { id: "edit", label: "Edit" },
            { id: "delete", label: "Delete draft", danger: true },
        ];
    }
    if (s.canWrite && owed) {
        const canLink = s.payOnline && !s.charging;
        const actions: DetailAction[] = [];
        if (s.sendable) {
            actions.push(
                s.reminding
                    ? {
                          id: "remind",
                          label: "Send reminder",
                          primary: true,
                          disabled: s.reminderWaits,
                      }
                    : { id: "send", label: send, primary: true },
            );
        }
        if (canLink) {
            actions.push({
                id: "copyLink",
                label: s.linkBusy ? "Making a link…" : "Copy pay link",
                primary: !s.sendable,
                disabled: s.linkBusy,
            });
        } else if (!s.payOnline && !s.charging) {
            // No pay link can be made (#833): a link that shows the
            // invoice and how to pay, for the merchant to send themselves.
            actions.push({
                id: "copyViewLink",
                label: s.linkBusy ? "Making a link…" : "Copy view link",
                disabled: s.linkBusy,
            });
        }
        return [
            ...actions,
            {
                id: "pay",
                label: "Mark paid",
                primary: !canLink && !s.sendable,
            },
            { id: "print", label: "Print" },
            ...pdf,
            { id: "cancel", label: "Cancel invoice", danger: true },
        ];
    }
    // Owed, and this role can't record it (DEC-098): Mark paid is shown,
    // disabled, with why — the permission decides, never the role's name.
    const locked: DetailAction[] =
        !s.canWrite && owed
            ? [
                  {
                      id: "pay",
                      label: "Mark paid",
                      disabled: true,
                      reason: CANT_MARK_PAID,
                  },
              ]
            : [];
    // A paid invoice keeps its view link (UX-080): the customer's copy,
    // paid, for the merchant to hand over. An order's paper is the order's.
    const paidView: DetailAction[] =
        s.canWrite && s.standing === "PAID" && !s.credit && !s.fromOrder
            ? [
                  {
                      id: "copyViewLink",
                      label: s.linkBusy ? "Making a link…" : "Copy view link",
                      disabled: s.linkBusy,
                  },
              ]
            : [];
    const actions: DetailAction[] = [
        ...locked,
        { id: "print", label: "Print", primary: true },
        ...paidView,
        ...pdf,
    ];
    if (s.canWrite && s.standing === "PAID" && !s.credit) {
        actions.push(
            s.fromOrder
                ? {
                      id: "refundOrder",
                      label: "Refund on the order",
                      danger: true,
                  }
                : { id: "refund", label: "Refund…", danger: true },
        );
    }
    return actions;
}
