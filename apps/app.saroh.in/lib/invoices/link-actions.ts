import {
    createPayLink,
    createViewLink,
    remindInvoice,
    sendInvoice,
    shareInvoice,
} from "./actions";
import { forgetLink, rememberLink } from "./minted-links";
import type { ShareAsk } from "./service";

/**
 * Every way this app replaces an invoice's link token, with the tab's
 * memory of it kept in step (UX-048, #870). The API keeps one token per
 * invoice: a new payment link, a view link, a send and a reminder each make a
 * new one and end the one before. So a payment link made here is remembered to
 * show again, and anything else that replaces it forgets it — otherwise
 * "Show link again" would show a dead link. Call these, never the actions
 * behind them, from a screen.
 */

/** A new payment link, remembered. `updatedAt`: the invoice's, as known now. */
export async function newPayLink(id: string, updatedAt?: string | null) {
    const res = await createPayLink(id);
    if (res.ok) {
        rememberLink(id, res.data.url, updatedAt, res.data.payLinkMadeAt);
    }
    return res;
}

/** A link to view it (#833): it replaces the payment link this tab made. */
export async function newViewLink(id: string) {
    const res = await createViewLink(id);
    if (res.ok) forgetLink(id);
    return res;
}

/**
 * Send it (D17). By email it goes with a fresh link, ending the one kept
 * here; a thread-only send doesn't, but forgetting is the safe side: the
 * screen then offers a new link rather than a dead one.
 */
export async function sendWithLink(id: string) {
    const res = await sendInvoice(id);
    if (res.ok) forgetLink(id);
    return res;
}

/** A reminder, the same way. */
export async function remindWithLink(id: string) {
    const res = await remindInvoice(id);
    if (res.ok) forgetLink(id);
    return res;
}

/**
 * Share it by hand (DEC-173, U11): WhatsApp and Link make a fresh link and
 * end the one before, as a send does. A payment link made here is
 * remembered to show again; a view link, or PDF and print, which make
 * none, leave the memory as it is or clear it. `updatedAt`: the invoice's,
 * as known now.
 */
export async function shareWithLink(
    id: string,
    ask: ShareAsk,
    updatedAt?: string | null,
) {
    const res = await shareInvoice(id, ask);
    if (res.ok && res.data.url) {
        if (res.data.payOnline) {
            rememberLink(id, res.data.url, updatedAt);
        } else forgetLink(id);
    }
    return res;
}
