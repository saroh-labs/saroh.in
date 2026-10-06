import { Injectable, Logger } from "@nestjs/common";
import type { Job, Prisma } from "@saroh/database";
import { prisma, runInOrgContext } from "@saroh/database";

import { appBase } from "../../common/app-url";
import { fromMinor } from "../../common/money";
import { CommunicationsService } from "../communications/communications.service";
import { escapeHtml } from "../communications/transactional";
import { formatMoney } from "../invoices/invoice-send.service";
import { holdsOnPayment, payOnHandoverWords } from "../orders/online-checkout";
import { orderPartyName } from "../orders/walk-in";
import { resolveCapabilities } from "../organizations/organization-policy";
import type { AlertEvent } from "./alert-preferences";
import { alertOn, mayHearAbout } from "./alert-preferences";
import type { TeamAlertPayload } from "./team-alerts";
import { TEAM_ALERT_TYPE } from "./team-alerts";
import { putOffUntilDue, wordUncollected } from "./uncollected-alert";

export { TEAM_ALERT_TYPE } from "./team-alerts";
export { ORDER_UNCOLLECTED_NOTIFICATION_TYPE } from "./uncollected-alert";

/** The inbox notice types F14's alerts write (see `ALERT_NOTIFICATION_TYPES`). */
export const ORDER_NEW_NOTIFICATION_TYPE = "order.new";
export const PAYMENT_FAILED_NOTIFICATION_TYPE = "payment.failed";
export const TEAM_JOINED_NOTIFICATION_TYPE = "team.joined";
export const SITE_LIVE_NOTIFICATION_TYPE = "site.live";
export const SITE_NOT_LIVE_NOTIFICATION_TYPE = "site.not_live";

type Tx = Prisma.TransactionClient;

/** An alert, worded. */
export interface WordedAlert {
    event: AlertEvent;
    /** Unique per business: claimed once, so the alert goes out once. */
    eventKey: string;
    /** The inbox notice already written (a booking's), or null to write one. */
    notificationId: string | null;
    type: string;
    title: string;
    body: string;
    /** Where it opens in the workspace, for the email. */
    path: string | null;
    /** Not emailed about their own doing. */
    skipUserId: string | null;
    /**
     * Emailed whatever they chose, while still on the team: whoever
     * scheduled a go-live hears how it went (DEC-071, T10).
     */
    alwaysUserId?: string | null;
    orderId?: string;
}

/** What a row is called in the grid, for the email's footer. */
const ROW_LABEL: Record<AlertEvent, string> = {
    order: "New order",
    booking: "New booking",
    failed: "Payment failed",
    team: "Someone joins the team",
    site: "Website goes live",
};

const BUILT_IN_LABEL: Partial<Record<string, string>> = {
    OWNER: "Owner",
    ADMIN: "Admin",
    MEMBER: "Member",
    REVIEWER: "Reviewer",
};

/**
 * Consumer for `team.alert` (round-2 F14): tells the business's team about
 * a new order, a booking the customer made, moved or cancelled, a failed
 * payment, someone joining, a scheduled go-live of the website that ran
 * (DEC-071, T10), or a website order to pay on handover nobody came for in
 * three days (R34, on the New order row), as each person chose in
 * Settings › Your profile.
 *
 * On one transaction, in the business's RLS context:
 *  1. What it is about is read again now, and worded. Something that no
 *     longer stands — an online checkout never paid, an order cancelled
 *     already, a payment that went through after all, someone who has left
 *     — is not announced.
 *  2. The event is claimed (a `CustomerNotice`, `TEAM_TOLD`, as A14 claims
 *     its team notices), so a job run twice tells the team once.
 *  3. **The bell:** one notice in the business's inbox. Each person's inbox
 *     leaves out what they turned the bell off for, or can't read
 *     (`notifications.service.ts`). A booking's notice is already there.
 *  4. **Email:** through the business's own connected provider only
 *     (DEC-011), to each person on the team whose role reads it and who has
 *     email on for it — by default, a failed payment and a scheduled
 *     go-live. Whoever scheduled a go-live is emailed whatever they chose.
 *
 * Nothing goes by WhatsApp or SMS: Saroh keeps no number for a team member.
 */
@Injectable()
export class TeamAlertHandler {
    private readonly logger = new Logger(TeamAlertHandler.name);

    constructor(private readonly comms: CommunicationsService) {}

    readonly handle = async (job: Job): Promise<void> => {
        const payload = payloadOf(job.payload);
        if (!payload || !job.organizationId) {
            this.logger.warn(
                `${TEAM_ALERT_TYPE} job ${job.id} names nothing to tell; skipped`,
            );
            return;
        }
        const organizationId = job.organizationId;
        const now = new Date();
        await runInOrgContext(organizationId, () =>
            prisma.$transaction(async (tx) => {
                // An uncollected order not due yet (its business moved its
                // zone since) waits for its day rather than being dropped.
                if (
                    payload.event === "uncollected" &&
                    (await putOffUntilDue(tx, organizationId, payload, now))
                ) {
                    return { told: false, emailed: 0 };
                }
                return tellTeam(tx, this.comms, organizationId, payload, now);
            }),
        );
    };
}

/** Word the alert, claim it, write the bell's notice and queue the emails. */
export async function tellTeam(
    tx: Tx,
    comms: Pick<CommunicationsService, "emailConnected" | "queueTransactional">,
    organizationId: string,
    payload: TeamAlertPayload,
    now: Date = new Date(),
): Promise<{ told: boolean; emailed: number }> {
    const alert = await wordAlert(tx, organizationId, payload, now);
    if (!alert) return { told: false, emailed: 0 };

    // Claimed first, skipping a duplicate: a Postgres transaction can't go
    // on after a caught P2002 (backend-jobs.md).
    const claimed = await tx.customerNotice.createMany({
        data: [
            {
                organizationId,
                eventKey: alert.eventKey,
                kind: "TEAM_TOLD",
                orderId: alert.orderId ?? null,
            },
        ],
        skipDuplicates: true,
    });
    if (claimed.count === 0) return { told: false, emailed: 0 };

    if (!alert.notificationId) {
        const notification = await tx.notification.create({
            data: {
                organizationId,
                type: alert.type,
                title: alert.title,
                body: alert.body,
            },
            select: { id: true },
        });
        await tx.customerNotice.update({
            where: {
                organizationId_eventKey: {
                    organizationId,
                    eventKey: alert.eventKey,
                },
            },
            data: { notificationId: notification.id },
        });
    }

    const emailed = await emailTeam(tx, comms, organizationId, alert);
    return { told: true, emailed };
}

/** Email each person who chose email for this alert and may read it. */
async function emailTeam(
    tx: Tx,
    comms: Pick<CommunicationsService, "emailConnected" | "queueTransactional">,
    organizationId: string,
    alert: WordedAlert,
): Promise<number> {
    if (!(await comms.emailConnected(tx, organizationId))) return 0;

    const [members, roles, choices, org] = await Promise.all([
        tx.membership.findMany({
            where: { organizationId },
            select: { userId: true, role: true },
            orderBy: { userId: "asc" },
        }),
        tx.organizationRole.findMany({
            where: { organizationId },
            select: { key: true, actions: true },
        }),
        tx.notificationPreference.findMany({
            where: { organizationId, event: alert.event, channel: "email" },
            select: {
                userId: true,
                event: true,
                channel: true,
                enabled: true,
            },
        }),
        tx.organization.findUnique({
            where: { id: organizationId },
            select: { name: true },
        }),
    ]);

    const recipients = members.filter((m) => {
        if (m.userId === alert.skipUserId) return false;
        if (m.userId === alert.alwaysUserId) return true;
        const actions = resolveCapabilities(
            m.role,
            roles.find((r) => r.key === m.role)?.actions ?? null,
        );
        if (!mayHearAbout(alert.event, (a) => actions.has(a), m.role)) {
            return false;
        }
        return alertOn(
            choices.filter((c) => c.userId === m.userId),
            alert.event,
            "email",
        );
    });

    const rendered = renderAlertEmail(alert, org?.name ?? "Your business");
    for (const m of recipients) {
        await comms.queueTransactional(tx, organizationId, {
            template: "TEAM_ALERT",
            rendered,
            recipient: { kind: "TEAM_MEMBER", userId: m.userId },
            createdByUserId: null,
        });
    }
    return recipients.length;
}

/** The email: the alert's own words, a link, and why they got it. */
export function renderAlertEmail(
    alert: Pick<WordedAlert, "event" | "title" | "body" | "path">,
    business: string,
): { subject: string; body: string } {
    const base = appBase();
    const lines = [
        `<p><strong>${escapeHtml(alert.title)}</strong></p>`,
        alert.body ? `<p>${escapeHtml(alert.body)}</p>` : "",
        alert.path
            ? `<p><a href="${escapeHtml(`${base}${alert.path}`)}">Open it in Saroh</a></p>`
            : "",
        `<p>You get this because email is on for &ldquo;${escapeHtml(ROW_LABEL[alert.event])}&rdquo; in your alerts at ${escapeHtml(business)}. You can change it in Settings, under Your profile.</p>`,
    ];
    return {
        subject: `${business}: ${alert.title}`,
        body: lines.filter(Boolean).join("\n"),
    };
}

/** What the alert is about, read now and worded; null when it no longer stands. */
export async function wordAlert(
    tx: Tx,
    organizationId: string,
    payload: TeamAlertPayload,
    now: Date = new Date(),
): Promise<WordedAlert | null> {
    switch (payload.event) {
        case "order":
            return wordOrder(tx, organizationId, payload);
        case "failed":
            return wordFailed(tx, organizationId, payload);
        case "team":
            return wordJoined(tx, organizationId, payload);
        case "booking":
            return wordBooking(tx, organizationId, payload);
        case "site":
            return wordSite(tx, organizationId, payload);
        case "uncollected":
            return wordUncollected(tx, organizationId, payload, now);
    }
}

async function wordOrder(
    tx: Tx,
    organizationId: string,
    p: Extract<TeamAlertPayload, { event: "order" }>,
): Promise<WordedAlert | null> {
    const order = await tx.order.findFirst({
        where: { id: p.orderId, organizationId },
        select: {
            id: true,
            orderId: true,
            total: true,
            currency: true,
            status: true,
            paymentStatus: true,
            placedOnline: true,
            payOnHandover: true,
            fulfilment: true,
            customerId: true,
            walkInName: true,
            customer: {
                select: { firstName: true, lastName: true, email: true },
            },
        },
    });
    if (!order || order.status === "CANCELLED") return null;
    // An online checkout is an order only once it is paid (G13); one to be
    // paid on handover is an order from the start.
    if (holdsOnPayment(order) && order.paymentStatus !== "PAID") return null;
    return {
        event: "order",
        eventKey: `team:order:${order.id}`,
        notificationId: null,
        type: ORDER_NEW_NOTIFICATION_TYPE,
        title: `New order ${order.orderId} from ${orderPartyName(order)}`,
        body: `${formatMoney(order.total, order.currency)}, ${orderPaidWords(order)}.`,
        path: `/commerce/orders/${order.id}`,
        skipUserId: p.actorUserId ?? null,
        orderId: order.id,
    };
}

async function wordFailed(
    tx: Tx,
    organizationId: string,
    p: Extract<TeamAlertPayload, { event: "failed" }>,
): Promise<WordedAlert | null> {
    const [intent, invoice] = await Promise.all([
        tx.paymentIntent.findFirst({
            where: { id: p.paymentIntentId, organizationId },
            select: {
                status: true,
                amountCents: true,
                currency: true,
                viaMandateId: true,
            },
        }),
        tx.invoice.findFirst({
            where: { id: p.invoiceId, organizationId },
            select: {
                id: true,
                number: true,
                status: true,
                billToName: true,
                contact: { select: { firstName: true, lastName: true } },
            },
        }),
    ]);
    // Paid since, or gone: nothing failed that still matters.
    if (intent?.status !== "FAILED" || !invoice) return null;
    if (invoice.status === "PAID" || invoice.status === "VOID") return null;
    const contact = [invoice.contact?.firstName, invoice.contact?.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();
    // `||`, not `??`: an empty name falls through too.
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    const who = invoice.billToName?.trim() || contact || "The customer";
    const amount = formatMoney(fromMinor(intent.amountCents), intent.currency);
    return {
        event: "failed",
        eventKey: `team:failed:${p.paymentIntentId}`,
        notificationId: null,
        type: PAYMENT_FAILED_NOTIFICATION_TYPE,
        title: `Payment failed on invoice ${invoice.number ?? "(draft)"}`,
        // An autopay charge (D13) has no link they tried: the merchant retries.
        body: intent.viaMandateId
            ? `${who}'s autopay charge of ${amount} didn't go through. Retry it, or send them a pay link.`
            : `${who}'s payment of ${amount} didn't go through. They can try again from the same link.`,
        path: `/billing/invoices/${invoice.id}`,
        skipUserId: null,
    };
}

async function wordJoined(
    tx: Tx,
    organizationId: string,
    p: Extract<TeamAlertPayload, { event: "team" }>,
): Promise<WordedAlert | null> {
    const member = await tx.membership.findUnique({
        where: {
            organizationId_userId: { organizationId, userId: p.userId },
        },
        select: { role: true, user: { select: { name: true, email: true } } },
    });
    // Left again before we got to it: nobody to announce.
    if (!member) return null;
    const role = await tx.organizationRole.findFirst({
        where: { organizationId, key: member.role },
        select: { label: true },
    });
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    const who = member.user.name?.trim() || member.user.email;
    const label = role?.label ?? BUILT_IN_LABEL[member.role] ?? member.role;
    return {
        event: "team",
        eventKey: `team:joined:${p.invitationId}`,
        notificationId: null,
        type: TEAM_JOINED_NOTIFICATION_TYPE,
        title: `${who} joined the team`,
        body: `They accepted your invitation, as ${label}.`,
        path: "/settings/people",
        skipUserId: p.userId,
    };
}

async function wordBooking(
    tx: Tx,
    organizationId: string,
    p: Extract<TeamAlertPayload, { event: "booking" }>,
): Promise<WordedAlert | null> {
    const notice = await tx.notification.findFirst({
        where: { id: p.notificationId, organizationId },
        select: { id: true, type: true, title: true, body: true },
    });
    if (!notice) return null;
    const bookingId = await tx.customerNotice.findFirst({
        where: { organizationId, notificationId: notice.id },
        select: { bookingId: true },
    });
    return {
        event: "booking",
        eventKey: `team:email:${notice.id}`,
        notificationId: notice.id,
        type: notice.type,
        title: notice.title,
        body: notice.body ?? "",
        path: bookingId?.bookingId ? `/bookings/${bookingId.bookingId}` : null,
        skipUserId: null,
    };
}

/**
 * A scheduled go-live, said as it turned out (DEC-071, T10). A LIVE that
 * the release no longer shows (it can't be undone, so only a deleted
 * release) is not announced; a NOT_LIVE is, with the run's own reason.
 */
async function wordSite(
    tx: Tx,
    organizationId: string,
    p: Extract<TeamAlertPayload, { event: "site" }>,
): Promise<WordedAlert | null> {
    const release = await tx.siteTestRelease.findFirst({
        where: { id: p.testReleaseId, organizationId },
        select: {
            siteId: true,
            name: true,
            wentLiveAt: true,
            site: { select: { name: true } },
        },
    });
    if (!release) return null;
    const base = {
        event: "site" as const,
        eventKey: `team:site:${p.testReleaseId}:${p.goLiveAt}`,
        notificationId: null,
        skipUserId: null,
        alwaysUserId: p.schedulerUserId,
    };
    if (p.outcome === "LIVE") {
        if (!release.wentLiveAt) return null;
        return {
            ...base,
            type: SITE_LIVE_NOTIFICATION_TYPE,
            title: `${release.name} is live on ${release.site.name}`,
            body: "It went live at the time it was scheduled for.",
            path: `/sites/${release.siteId}/versions`,
        };
    }
    return {
        ...base,
        type: SITE_NOT_LIVE_NOTIFICATION_TYPE,
        title: `${release.name} didn't go live on ${release.site.name}`,
        body: p.reason ?? "Go live now, or schedule it again.",
        path: `/sites/${release.siteId}/pages`,
    };
}

function payloadOf(value: unknown): TeamAlertPayload | null {
    if (typeof value !== "object" || value === null) return null;
    const p = value as Record<string, unknown>;
    const str = (k: string) => typeof p[k] === "string" && p[k] !== "";
    switch (p.event) {
        case "order":
            return str("orderId") ? (p as TeamAlertPayload) : null;
        case "failed":
            return str("invoiceId") && str("paymentIntentId")
                ? (p as TeamAlertPayload)
                : null;
        case "team":
            return str("userId") && str("invitationId")
                ? (p as TeamAlertPayload)
                : null;
        case "booking":
            return str("notificationId") ? (p as TeamAlertPayload) : null;
        case "uncollected":
            return str("orderId") ? (p as TeamAlertPayload) : null;
        case "site":
            return str("testReleaseId") &&
                str("goLiveAt") &&
                str("schedulerUserId") &&
                (p.outcome === "LIVE" || p.outcome === "NOT_LIVE")
                ? (p as TeamAlertPayload)
                : null;
        default:
            return null;
    }
}

/** "paid online", "at the counter", or "to pay on collection". */
function orderPaidWords(order: {
    placedOnline: boolean;
    payOnHandover: boolean;
    paymentStatus: string;
    fulfilment: string;
}): string {
    if (order.payOnHandover) {
        return order.paymentStatus === "PAID"
            ? "paid on handover"
            : `to ${payOnHandoverWords(order.fulfilment)}`;
    }
    return order.placedOnline ? "paid online" : "at the counter";
}
