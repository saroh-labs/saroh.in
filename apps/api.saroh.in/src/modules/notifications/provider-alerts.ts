import type { Prisma } from "@saroh/database";

import type { TeamAlertPayload, WordedAlert } from "./team-alerts";
import { enqueueTeamAlert } from "./team-alerts";

/**
 * A business's own connected provider that stops working, and starts again
 * (UX-012, #555).
 *
 * **Down.** A live call that the provider answers 401 or 403 — a checkout's
 * provider order (`payments/provider-keys.ts`), or an email's send
 * (`communications/message-send.handler.ts`) — throws
 * `ProviderKeysRefusedError`. The caller marks the connection as needing
 * attention (`attentionAt`, claimed only while it is null) and queues a
 * `team.alert` `{ event: "provider", change: "down" }` on the same
 * transaction. A timeout, a 429 or a 5xx flags nothing: only the keys
 * themselves being refused stops payments or emails until someone acts.
 *
 * **Back.** The connection works again when someone enters keys that pass
 * the provider's check (Settings › Providers), or when a live call on the
 * flagged connection is accepted after all (the provider let the key or the
 * sending domain back in). Either clears the flag and queues
 * `{ change: "back" }` on the same transaction.
 *
 * **Once per incident.** Each told change is claimed as a `TEAM_TOLD`
 * `CustomerNotice` keyed `team:provider:<id>:<down|back>:<at>`, and the last
 * one told decides what may be told next, as a domain's alerts do (#917):
 * "down" only when the last told wasn't "down", "back" only when it was.
 * So a refusal and a fix before anyone was told say nothing either way, and
 * a connection that never failed never hears "working again". A claim made
 * before #555 (`team:provider:<id>:<at>`) reads as "down". Telling one
 * connection is serialised on an advisory lock (`provider-alert:<id>`).
 *
 * Told on the Payment failed row (bell, and email on by default), from
 * Saroh (DEC-011 amended 2026-10-07, (B)), so an email provider's refusal
 * still reaches the team. Fixed words only: a provider's name is ours, not
 * something the business typed.
 */

/** The inbox notice types, on the Payment failed row (`alert-preferences.ts`). */
export const PROVIDER_ATTENTION_NOTIFICATION_TYPE = "provider.attention";
export const PROVIDER_BACK_NOTIFICATION_TYPE = "provider.back";

export type ProviderAlertChange = "down" | "back";
export type ProviderAlertChannel = "PAYMENTS" | "EMAIL";

type Tx = Prisma.TransactionClient;
type ProviderAlert = Extract<TeamAlertPayload, { event: "provider" }>;

/** How a provider is named in an alert. */
const PROVIDER_NAMES: Partial<Record<string, string>> = {
    RAZORPAY: "Razorpay",
    CASHFREE: "Cashfree",
    RESEND: "Resend",
    SENDGRID: "SendGrid",
    SMTP: "SMTP relay",
};

/** The claim key's prefix for one connection's alerts. */
function keyPrefix(providerId: string): string {
    return `team:provider:${providerId}:`;
}

/**
 * The change last told for this connection, or null when none was. A key
 * written before #555 carried no change and was always a refusal.
 */
export async function lastToldProviderChange(
    tx: Pick<Tx, "customerNotice">,
    organizationId: string,
    providerId: string,
): Promise<ProviderAlertChange | null> {
    const last = await tx.customerNotice.findFirst({
        where: {
            organizationId,
            kind: "TEAM_TOLD",
            eventKey: { startsWith: keyPrefix(providerId) },
        },
        orderBy: { createdAt: "desc" },
        select: { eventKey: true },
    });
    if (!last) return null;
    const change = last.eventKey.slice(keyPrefix(providerId).length);
    return change.startsWith("back:") ? "back" : "down";
}

/** Whether `change` may be told after `last` (one per incident). */
export function mayTellProvider(
    change: ProviderAlertChange,
    last: ProviderAlertChange | null,
): boolean {
    return change === "down" ? last !== "down" : last === "down";
}

/**
 * Queue "working again" for a connection whose flag was just cleared, on
 * the clearing write's transaction. Nothing is queued when the team was
 * never told it stopped. WhatsApp has no alert wording, so only payments
 * and email are told. `actorUserId` is who entered the keys; they see it
 * on the screen, so they aren't emailed.
 */
export async function queueProviderBack(
    tx: Pick<Tx, "customerNotice" | "job">,
    row: { id: string; organizationId: string },
    channel: ProviderAlertChannel,
    at: Date,
    actorUserId: string | null = null,
): Promise<boolean> {
    const last = await lastToldProviderChange(tx, row.organizationId, row.id);
    if (!mayTellProvider("back", last)) return false;
    await enqueueTeamAlert(tx, row.organizationId, {
        event: "provider",
        change: "back",
        channel,
        providerId: row.id,
        since: at.toISOString(),
        actorUserId,
    });
    return true;
}

/**
 * The alert, read now and worded; null when it no longer stands — the
 * connection is gone or disconnected, its flag isn't the one this alert
 * names (keys entered again, or flagged again since), it works again
 * before "down" was told or fails again before "back" was, or this change
 * was told already for the incident. Takes the connection's lock first, so
 * its changes are told one at a time.
 */
export async function wordProvider(
    tx: Tx,
    organizationId: string,
    p: ProviderAlert,
): Promise<WordedAlert | null> {
    const lock = `provider-alert:${p.providerId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lock}))`;
    const where = { id: p.providerId, organizationId };
    const select = {
        provider: true,
        status: true,
        attentionAt: true,
    } as const;
    const row =
        p.channel === "PAYMENTS"
            ? await tx.merchantPaymentProvider.findFirst({ where, select })
            : await tx.communicationProvider.findFirst({ where, select });
    if (row?.status !== "CONNECTED") return null;
    const change: ProviderAlertChange = p.change ?? "down";
    if (change === "down") {
        if (row.attentionAt?.toISOString() !== p.since) return null;
    } else if (row.attentionAt) {
        return null;
    }
    const last = await lastToldProviderChange(tx, organizationId, p.providerId);
    if (!mayTellProvider(change, last)) return null;

    const name = PROVIDER_NAMES[row.provider] ?? row.provider;
    const base = {
        event: "failed" as const,
        eventKey: `${keyPrefix(p.providerId)}${change}:${p.since}`,
        notificationId: null,
        path: "/settings/providers",
        cta: "Open Providers",
        skipUserId: p.actorUserId ?? null,
    };
    const words = WORDS[p.channel][change](name);
    return {
        ...base,
        type:
            change === "down"
                ? PROVIDER_ATTENTION_NOTIFICATION_TYPE
                : PROVIDER_BACK_NOTIFICATION_TYPE,
        title: words.heading,
        body: words.body,
        mail: words,
    };
}

/**
 * What each change says, the same in the bell and Saroh's email: what
 * stopped, what it means for customers, and where to fix it.
 */
const WORDS: Record<
    ProviderAlertChannel,
    Record<
        ProviderAlertChange,
        (name: string) => { heading: string; body: string }
    >
> = {
    PAYMENTS: {
        down: (name) => ({
            heading: `${name} refused your keys`,
            body: `Customers can't pay online until you connect ${name} again with keys that work, in Settings › Providers. We'll tell you when it works again.`,
        }),
        back: (name) => ({
            heading: `${name} is working again`,
            body: `Customers can pay online again through ${name}.`,
        }),
    },
    EMAIL: {
        down: (name) => ({
            heading: `${name} refused your email keys`,
            body: `Emails to your customers, like booking confirmations and invoices, aren't going out. Connect ${name} again with a key that works, and check your sending domain is still verified there, in Settings › Providers. We'll tell you when it works again.`,
        }),
        back: (name) => ({
            heading: `${name} is working again`,
            body: `Emails to your customers are going out through ${name} again.`,
        }),
    },
};
