import type { SendChannel } from "../invoices/send-view";
import type { NoticeReach } from "../site-accounts/notice-reach";
import type { HomeInline } from "./home-model";

/**
 * What Home's inline actions say (round 2, F4). Pure, so every sentence is
 * tested: who is told, how, and what can be taken back. A sentence here
 * never promises a message the API won't send, and never hides one it will
 * (default 51, saroh-product "Say what is sent").
 *
 * The channels come from the target's own rule, the one its detail screen
 * reads: an order's step notice from A14's `contactReach`, an invoice's
 * send from D17's send flag, a reply from A13's thread (a live site
 * account). Home never decides on its own that something can be sent.
 */

type Words = Pick<HomeInline, "label" | "confirm" | "yes" | "done" | "sends">;

/** "Farah" from "Farah Khan"; a row with no name speaks of "the customer". */
export function firstNameOf(name: string | null | undefined): string | null {
    // "" for a name of only spaces: no name, not an empty one.
    const first = name?.trim().split(/\s+/)[0] ?? "";
    return first.length > 0 ? first : null;
}

/**
 * Mark sent (MARK_SENT): the order's move to its handover step. `notifies`
 * is whether that step has a customer notice at all (A14 tells the
 * customer about a courier handover or a delivery going out; a digital
 * order's "sent" has none), and `reach` how it would reach them.
 */
export function markSentWords(
    first: string | null,
    notifies: boolean,
    reach: NoticeReach,
): Words {
    const who = first ?? "the customer";
    const done = "Marked sent";
    const quiet: Words = {
        label: "Mark sent",
        confirm: `Nothing is sent to ${who}. The order shows as sent.`,
        yes: "Mark sent",
        done,
        sends: false,
    };
    if (!notifies || reach === "NONE") return quiet;
    const onItsWay = "that the order is on its way";
    switch (reach) {
        case "EMAIL_AND_ACCOUNT":
            return {
                label: "Mark sent",
                confirm: `This tells ${who} by email and in their account on your site ${onItsWay}.`,
                yes: first ? `Mark sent and tell ${first}` : "Mark sent",
                done: `${done} · ${first ?? "They"} will be told`,
                sends: true,
            };
        case "EMAIL":
            return {
                label: "Mark sent",
                confirm: `This tells ${who} by email ${onItsWay}.`,
                yes: first ? `Mark sent and tell ${first}` : "Mark sent",
                done: `${done} · ${first ?? "They"} will be told`,
                sends: true,
            };
        case "ACCOUNT":
            return {
                label: "Mark sent",
                confirm: `This tells ${who} in their account on your site ${onItsWay}. Nothing is emailed.`,
                yes: first ? `Mark sent and tell ${first}` : "Mark sent",
                done: `${done} · shown in ${first ? `${first}'s` : "their"} account`,
                sends: true,
            };
        case "ON_SIGN_IN":
            return {
                label: "Mark sent",
                confirm: `${capital(who)} sees ${onItsWay} when they sign in on your site. Nothing is emailed.`,
                yes: "Mark sent",
                done,
                sends: true,
            };
    }
}

/**
 * Retry by autopay (RETRY, `via: MANDATE`, D13): the subscription's own
 * retry, which charges the customer's autopay again. Their provider tells
 * them about the debit first (the pre-debit notice), so the charge lands
 * a day or so later; Saroh sends nothing itself.
 */
export function retryMandateWords(first: string | null): Words {
    const whose = first ? `${first}'s` : "their";
    return {
        label: "Charge autopay again",
        confirm: `This charges ${whose} autopay again for this renewal. Their bank tells them a day ahead, so the payment lands in a day or two. Saroh sends nothing itself.`,
        yes: "Charge autopay",
        done: "Autopay charge started",
        sends: false,
    };
}

/**
 * Retry by pay link (RETRY, `via: PAY_LINK`): the subscription's own retry,
 * which makes a new pay link for the unpaid renewal. Nothing is charged and
 * nothing is sent — the merchant copies the link and sends it themselves,
 * as on Subscription Detail.
 */
export function retryWords(first: string | null): Words {
    const whose = first ? `${first}'s` : "this";
    return {
        label: "Retry by pay link",
        confirm: `This makes a new pay link for ${whose} renewal, and the link sent before stops working. Saroh doesn't send it: copy it and send it to ${first ?? "them"} yourself.`,
        yes: "Make a new link",
        done: "New pay link ready",
        sends: false,
    };
}

/** "by email at farah@…", "in their account on your site", or both. */
function where(channels: readonly SendChannel[], emailTo?: string): string {
    const email = channels.includes("email");
    const thread = channels.includes("thread");
    const byEmail = `by email${emailTo ? ` at ${emailTo}` : ""}`;
    if (email && thread) return `${byEmail} and in their account on your site`;
    if (thread) return "in their account on your site";
    return byEmail;
}

/**
 * Send reminder (SEND_REMINDER): D17's `POST :id/remind`, on the channels
 * its send flag names — the same sentence Invoice Detail's reminder says.
 * An email carries a fresh pay link, so the one shared before stops.
 */
export function reminderWords(
    first: string | null,
    channels: readonly SendChannel[],
    emailTo?: string,
): Words {
    const who = first ?? "the customer";
    const what = `This reminds ${who} ${where(channels, emailTo)} that the bill is still to pay`;
    return {
        label: "Send reminder",
        confirm: channels.includes("email")
            ? `${what}, with a new pay link. A link you shared before stops working.`
            : `${what}, with a way to pay it. Nothing is emailed.`,
        yes: "Send reminder",
        done: first ? `Reminder sent to ${first}` : "Reminder sent",
        sends: true,
    };
}

/**
 * Reply (REPLY): A13's thread. A reply shows in the customer's account on
 * the business's site and nothing else is sent — no email, no text — which
 * is what Customer Detail's Messages tab says under its reply box too.
 */
export function replyWords(first: string | null, signsIn: boolean): Words {
    const who = first ?? "They";
    return {
        label: "Reply",
        confirm: signsIn
            ? `${who} sees your reply in Messages when they're signed in on your site. Nothing is emailed or texted.`
            : `${who} doesn't sign in on your site now. They'll see your reply when they sign in there. Nothing is emailed or texted.`,
        yes: "Send reply",
        done: first ? `Replied · it's in ${first}'s account` : "Replied",
        sends: true,
    };
}

/**
 * Reply to a low-star review (REVIEW_REPLY, F2): the reply is posted under
 * the review on the business's site, where anyone can read it. Nothing is
 * emailed: a review's reply has no sender, so the design's "and Dev is
 * emailed" isn't said.
 */
export function reviewReplyWords(first: string | null): Words {
    const whose = first ? `${first}'s` : "their";
    return {
        label: "Reply",
        confirm: `Your reply shows under ${whose} review on your site, where anyone can read it. Nothing is emailed.`,
        yes: "Post reply",
        done: "Reply posted",
        sends: true,
    };
}

/**
 * Refund (REFUND, PAY-06): a payment the provider took at a different
 * amount than asked goes back whole — `amount` is what it captured,
 * already formatted — through the business's provider, to how they paid.
 * The order or invoice it was for stays unpaid, and a refund can't be
 * taken back. The provider tells the customer, not Saroh.
 */
export function refundMismatchWords(
    first: string | null,
    amount: string,
    provider: string,
    paper: "order" | "invoice" | null,
): Words {
    const who = first ?? "the customer";
    const stays = paper ? ` The ${paper} stays unpaid, as it is now.` : "";
    return {
        label: "Refund",
        confirm: `${amount} goes back to ${who} through ${provider}, the way they paid.${stays} A refund can't be undone.`,
        yes: `Refund ${amount}`,
        done: first ? `Refund on its way to ${first}` : "Refund on its way",
        sends: false,
    };
}

function capital(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1);
}
