import {
    createPayLink,
    createViewLink,
    remindInvoice,
    sendInvoice,
} from "./actions";
import { forgetLink, rememberLink } from "./minted-links";

/**
 * Every way this app replaces an invoice's link token, with the tab's
 * memory of it kept in step (UX-048, #870). The API keeps one token per
 * invoice: a new pay link, a view link, a send and a reminder each make a
 * new one and end the one before. So a pay link made here is remembered to
 * show again, and anything else that replaces it forgets it — otherwise
 * "Show link again" would show a dead link. Call these, never the actions
 * behind them, from a screen.
 */

/** A new pay link, remembered. `updatedAt`: the invoice's, as known now. */
export async function newPayLink(id: string, updatedAt?: string | null) {
    const res = await createPayLink(id);
    if (res.ok) {
        rememberLink(id, res.data.url, updatedAt, res.data.payLinkMadeAt);
    }
    return res;
}

/** A link to view it (#833): it replaces the pay link this tab made. */
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
