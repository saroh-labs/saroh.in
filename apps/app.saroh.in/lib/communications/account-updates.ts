/**
 * "Updates in Messages" (12 Oct 2026): a business's own choice to have
 * Saroh post order, booking and invoice updates to its customers' Messages,
 * the thread in their account on the business's website. On by default.
 *
 * Off stops only what Saroh posts by itself. A customer can still write to
 * the business there, the team's replies still reach them, and so does a
 * note someone chooses to send when they change or cancel an order.
 *
 * The API decides when a post is written (`accountThreadOn`); this is what
 * the workspace says about it on Settings › Providers. Pure: safe in
 * server and client components.
 */

/** `GET …/customer-notices/account-updates`. */
export interface AccountUpdates {
    /** The business's choice. */
    on: boolean;
    /**
     * Whether the choice can have an effect: customers have an account on
     * this instance, and Messages is switched on for this business. Until
     * then the row isn't drawn, so nobody is offered a switch that does
     * nothing.
     */
    offered: boolean;
    /** Whether the business has its own email provider connected. */
    emailConnected: boolean;
}

export function isAccountUpdates(body: unknown): body is AccountUpdates {
    if (typeof body !== "object" || body === null) return false;
    const b = body as Record<string, unknown>;
    return (
        typeof b.on === "boolean" &&
        typeof b.offered === "boolean" &&
        typeof b.emailConnected === "boolean"
    );
}

export const ACCOUNT_UPDATES_TITLE = "Updates in Messages";
export const ACCOUNT_UPDATES_SHEET_LINE =
    "Whether Saroh posts order, booking and invoice updates to your customers' Messages, in their account on your website.";

/** The two choices, as the sheet words them. */
export const ACCOUNT_UPDATES_CHOICES = [
    {
        value: "on",
        label: "Post updates to Messages",
        note: "Customers see each step of an order, a booking that was confirmed, moved or cancelled, and an invoice you sent or a reminder about it.",
    },
    {
        value: "off",
        label: "Don't post updates",
        note: "Customers see none of these in Messages. They can still write to you there, and your replies still reach them. So does a note you choose to send when you change or cancel an order.",
    },
] as const;

export type AccountUpdatesChoice =
    (typeof ACCOUNT_UPDATES_CHOICES)[number]["value"];

export interface AccountUpdatesRow {
    /** "On" or "Off". */
    status: "On" | "Off";
    /** What customers see in Messages, as saved. */
    says: string;
    /** What that leaves them with, given the business's email. */
    reach: string;
    /** `reach` is a warning: nothing tells the customer. */
    nothingSent: boolean;
}

/**
 * The read row, or null when there is nothing to offer: unread, or the
 * choice can't have an effect yet (`offered`).
 */
export function accountUpdatesRow(
    state: AccountUpdates | null | undefined,
): AccountUpdatesRow | null {
    if (!state?.offered) return null;
    if (state.on) {
        return {
            status: "On",
            says: "Saroh posts order, booking and invoice updates to your customers' Messages.",
            reach: state.emailConnected
                ? "Your emails go out as well."
                : "No email provider is connected, so this is the only way your customers hear that an order is ready.",
            nothingSent: false,
        };
    }
    return {
        status: "Off",
        says: "Saroh posts no order, booking or invoice updates to your customers' Messages.",
        reach: state.emailConnected
            ? "Your emails still go out."
            : "No email provider is connected, so nothing tells a customer their order is ready. Call or message them yourself.",
        nothingSent: !state.emailConnected,
    };
}

/**
 * What the sheet says under the choices about email: with none connected,
 * turning updates off leaves no way to tell a customer anything.
 */
export function accountUpdatesEmailLine(emailConnected: boolean): string {
    return emailConnected
        ? "Your emails go out either way."
        : "No email provider is connected. With updates off, you have no other way to tell a customer their order is ready.";
}

/** The toast after a save. */
export function accountUpdatesSaved(on: boolean): string {
    return on ? "Updates to Messages are on." : "Updates to Messages are off.";
}
