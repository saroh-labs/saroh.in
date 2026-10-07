/**
 * A business's messages to its customers — invoices, booking and order
 * updates, review invitations — go only through its own connected email
 * provider (DEC-011, amended 2026-10-07). Without one its customers get no
 * emails and see their updates only in their account. This is what the
 * workspace says about it, and to whom:
 *
 * - **The prompt** (`emailPrompt`): Settings › Providers, and Home's Needs
 *   you (worded by the API, `home-email-setup.ts`, in the same sentences).
 *   Only to someone who can act: `comms:manage` to connect one, or, where
 *   the plan can't (Free, DEC-091), `billing:read` to see the plans.
 * - **Where a send is refused** (`emailRefusalNote`): why it can't go, in
 *   the screen's own words, with the way to fix it for whoever may.
 *
 * Both go once a provider is connected. Pure: safe in server and client
 * components.
 */

/** `GET …/comms-providers/email-setup`. */
export interface EmailSetup {
    connected: boolean;
    /**
     * When it has none: whether its plan lets it connect one now (false on
     * Free); null when that couldn't be read, which asks to connect, as the
     * connect itself goes ahead.
     */
    canConnect: boolean | null;
}

/** What this person may do about it. */
export interface EmailMay {
    /** `comms:manage`. */
    connect: boolean;
    /** `billing:read`. */
    plans: boolean;
}

export const EMAIL_PROMPT_TITLE = "Your customers get no emails from you";
export const EMAIL_PROMPT_MISSED =
    "No email provider is connected, so invoices, booking and order updates and review invitations aren't emailed. Your customers see their updates only in their account.";
export const EMAIL_PROMPT_PLAN =
    "Connecting your own email comes with a paid plan.";

export const CONNECT_EMAIL_HREF = "/settings/providers";
export const SEE_PLANS_HREF = "/settings/billing#change-plan";

export interface EmailAction {
    href: string;
    label: string;
}

export interface EmailNote {
    text: string;
    /** The way to fix it, when this person may take it. */
    action: EmailAction | null;
}

export interface EmailPrompt extends EmailNote {
    title: string;
    /** Connect one, or (DEC-091) see the plans. */
    kind: "connect" | "plans";
}

/**
 * The prompt to connect the business's own email, or null: connected,
 * unread, or nothing this person can do about it here. `connectHref` is
 * where Connect goes from here; null when there is nowhere to connect one
 * (Settings › Providers offering no email provider: Communications off, or
 * the one it had is disconnected and its own row says so), and then the
 * connect prompt isn't drawn.
 */
export function emailPrompt(
    setup: EmailSetup | null | undefined,
    may: EmailMay,
    connectHref: string | null = CONNECT_EMAIL_HREF,
): EmailPrompt | null {
    if (!setup || setup.connected) return null;
    if (setup.canConnect === false) {
        if (!may.plans) return null;
        return {
            kind: "plans",
            title: EMAIL_PROMPT_TITLE,
            text: `${EMAIL_PROMPT_MISSED} ${EMAIL_PROMPT_PLAN}`,
            action: { href: SEE_PLANS_HREF, label: "See plans" },
        };
    }
    if (!may.connect || !connectHref) return null;
    return {
        kind: "connect",
        title: EMAIL_PROMPT_TITLE,
        text: EMAIL_PROMPT_MISSED,
        action: { href: connectHref, label: "Connect your email" },
    };
}

/**
 * Why a send can't go for want of the business's own email, in the
 * screen's words (`connect`, and `plans` where the plan can't connect one),
 * and the way to fix it for whoever may. Null once it is connected, or
 * when it couldn't be read.
 */
export function emailRefusalNote(
    setup: EmailSetup | null | undefined,
    may: EmailMay,
    words: { connect: string; plans: string },
): EmailNote | null {
    if (!setup || setup.connected) return null;
    if (setup.canConnect === false) {
        return {
            text: words.plans,
            action: may.plans
                ? { href: SEE_PLANS_HREF, label: "See plans" }
                : null,
        };
    }
    return {
        text: words.connect,
        action: may.connect
            ? { href: CONNECT_EMAIL_HREF, label: "Connect one" }
            : null,
    };
}

/** An invoice that can't be emailed: no provider (D17, DEC-011). */
export const INVOICE_EMAIL_WORDS = {
    connect:
        "Invoices are emailed from your own email provider, and none is connected, so this one can't be sent.",
    plans: "Invoices are emailed from your own email provider, and connecting one comes with a paid plan.",
};
