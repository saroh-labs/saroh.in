import type { BillingAccessView } from "@/lib/billing/access";
import { accessRow, ownAccountsRoom, upgradeHref } from "@/lib/billing/access";
import type { MessageChannel } from "@/lib/messages/constants";
import { CHANNEL_LABEL } from "@/lib/messages/constants";
import type { ConnectedCommsProvider } from "@/lib/providers/service";

/**
 * Whether the lead's "Send a message" composer can send on a channel, and
 * what it says instead when it can't (UX-067). The API refuses a message on
 * a channel with no connected provider, and every message route while
 * Communications is off, so the composer never lets the owner write a whole
 * message into a refusal:
 *
 * - Communications off: no composer. Someone who may turn modules on is
 *   told where; anyone else sees nothing about it.
 * - No connected provider for the channel: where the plan has room to
 *   connect one (the catalogue's `integrations` row, DEC-091 — the same
 *   decision as the connect's own check, `roomForOneMore`), "Connect your
 *   email to write from here" to Providers. Where it hasn't (Free, the
 *   DEC-086 amendment), the plan that has it and See plans.
 * - Unknown (the providers or the plan couldn't be read): the composer, as
 *   before; the send's refusal is then said in merchant words
 *   (`sendFailureWords`).
 *
 * Pure, so the page and its tests share it.
 */
export type ComposerGate =
    | { kind: "compose" }
    | { kind: "off"; canManage: boolean }
    | { kind: "connect"; title: string; cta: string; href: string }
    | { kind: "plan"; title: string; cta: string; href: string };

const NOUN: Record<MessageChannel, string> = {
    EMAIL: "your email",
    WHATSAPP: "WhatsApp",
};

export function composerGate({
    channel,
    communicationsOn,
    canManageModules,
    providers,
    access,
}: {
    channel: MessageChannel;
    /** Communications is on; null when the modules couldn't be read. */
    communicationsOn: boolean | null;
    canManageModules: boolean;
    /** The business's messaging providers; null when unread. */
    providers: readonly ConnectedCommsProvider[] | null;
    access: BillingAccessView | null;
}): ComposerGate {
    if (communicationsOn === false) {
        return { kind: "off", canManage: canManageModules };
    }
    if (!providers) return { kind: "compose" };
    const sends = providers.some(
        (p) => p.channel === channel && p.status === "CONNECTED",
    );
    if (sends) return { kind: "compose" };
    if (!ownAccountsRoom(access)) {
        const row = accessRow(access, "integrations");
        const up = row?.upgradeTo ?? null;
        const own =
            channel === "EMAIL"
                ? "Sending from your own email"
                : "Sending on your own WhatsApp";
        const title =
            row?.state === "on"
                ? `${own} needs room in your plan: every connection it allows is in use.`
                : up
                  ? `${own} comes with ${up.name}.`
                  : `${own} isn't in your ${access?.plan?.name ?? "current"} plan.`;
        return {
            kind: "plan",
            title,
            cta: up ? `See ${up.name}` : "See plans",
            href: upgradeHref(up?.planId),
        };
    }
    return {
        kind: "connect",
        title: `Connect ${NOUN[channel]} to write from here.`,
        cta: `Connect ${channel === "EMAIL" ? "email" : CHANNEL_LABEL[channel]}`,
        href: "/settings/providers",
    };
}

/**
 * A send's refusal in the owner's words, never the API's raw sentence
 * (`No connected provider for channel "EMAIL"`): what happened and where
 * it's fixed. Anything else is passed through, as the API words it for
 * people already.
 */
export function sendFailureWords(error: string, channel: MessageChannel) {
    if (/no connected provider/i.test(error)) {
        return `Nothing was sent: ${NOUN[channel]} isn't connected. Connect it in Settings › Providers.`;
    }
    if (/is not connected/i.test(error)) {
        return `Nothing was sent: ${NOUN[channel]} is disconnected. Reconnect it in Settings › Providers.`;
    }
    if (error.includes("MODULE_UNAVAILABLE")) {
        return "Nothing was sent: messaging is turned off for your business. Turn on Communications in Settings › Modules.";
    }
    return error;
}
