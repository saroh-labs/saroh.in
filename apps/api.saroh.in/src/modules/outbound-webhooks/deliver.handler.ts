import { HttpException, Injectable, Logger, Optional } from "@nestjs/common";
import type { WebhookEvent } from "@saroh/api-contract";
import { WEBHOOK_AUTO_OFF_AFTER, WEBHOOK_PING } from "@saroh/api-contract";
import type { Job, Prisma, WebhookEndpoint } from "@saroh/database";
import { prisma } from "@saroh/database";

import { appBase, editionOf } from "../../common/app-url";
import { sendTeamAlertEmail } from "../../common/email";
import type { StrictDeps } from "../../common/net/ssrf";
import { STRICT_DEPS, strictFetch } from "../../common/net/ssrf";
import {
    AuditAction,
    AuditOutcome,
    AuditService,
} from "../audit/audit.service";
import { CatalogueAccessService } from "../billing/catalogue-access.service";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { FlagKey } from "../feature-flags/flags";
import { noticeOf } from "../notifications/notice-target";
import { OrganizationContextService } from "../organizations/organization-context.service";
import { teamHolding } from "../organizations/team-powers";
import {
    bookingById,
    customerById,
    enquiryById,
    orderById,
} from "../public-api/v1-reads";
import { EVENT_CAPABILITY } from "./emitter";
import { hostOf, signingSecrets } from "./endpoints.service";
import {
    DELIVERY_ID_HEADER,
    SIGNATURE_HEADER,
    signatureHeader,
} from "./signing";

/** How long the receiver has to answer. */
export const DELIVERY_TIMEOUT_MS = 10_000;
/** How much of the answer the log keeps. */
export const SNIPPET_BYTES = 2048;
/** Deliveries in a row that run out of tries before the endpoint is switched off. */
export const AUTO_OFF_AFTER = WEBHOOK_AUTO_OFF_AFTER;

export const WEBHOOK_DISABLED_NOTIFICATION_TYPE = "webhook.disabled";
const SYSTEM_ACTOR = "system:webhooks";

/** What the record's `/v1` read is, and where it opens in the workspace. */
const RECORDS: Record<
    WebhookEvent,
    {
        read: (organizationId: string, id: string) => Promise<unknown>;
        path: string;
    }
> = {
    "booking.created": { read: bookingById, path: "/bookings/" },
    "booking.moved": { read: bookingById, path: "/bookings/" },
    "order.created": { read: orderById, path: "/commerce/orders/" },
    "order.paid": { read: orderById, path: "/commerce/orders/" },
    "order.status_changed": { read: orderById, path: "/commerce/orders/" },
    "customer.created": { read: customerById, path: "/customers/" },
    "enquiry.received": { read: enquiryById, path: "/leads/" },
};

/** What a delivery's `payload` holds: the record queued, a ping, or the body once built. */
// The body is kept as the text sent: jsonb reorders keys, and a resend sends the same bytes.
type Stored = { ref: string } | { ping: true } | { body: string };

/** The send's outcome as the log keeps it. */
interface Attempt {
    ok: boolean;
    status: number | null;
    error: string | null;
    snippet: string | null;
}

class DeliveryFailed extends Error {}

/**
 * `webhooks.deliver` (plan 2026-11-10-001, U13): one delivery, one try.
 *
 * Before sending it re-checks what could have changed since it was
 * queued: the endpoint still on, the kill switch, the plan, and that the
 * person whose access the endpoint runs on still belongs and may read the
 * event's record (as a key's creator is re-checked). A delivery that can't
 * go for one of those reasons is FAILED at once, with the reason, and
 * counts toward nothing.
 *
 * The body is built on the first try, through the `/v1` views (allowlists:
 * never a `customer:sensitive` field), with a link into the workspace of
 * the business's own edition, and kept, so retries and resends send the
 * same event. Each try is signed now (`signing.ts`) and POSTed through the
 * shared SSRF guard with a 10 s deadline; the first 2 KB of the answer are
 * kept. Anything but a 2xx throws, so the worker backs off and tries
 * again. On the last try the delivery is FAILED and the endpoint's failure
 * count goes up; at {@link AUTO_OFF_AFTER} in a row it is switched off,
 * and the business is told in the inbox and by email to its Owners. A
 * delivered one resets the count.
 */
@Injectable()
export class WebhookDeliverHandler {
    private readonly logger = new Logger(WebhookDeliverHandler.name);
    /** The resolver and transport; tests put a stub resolver and a local receiver here. */
    net: StrictDeps = STRICT_DEPS;

    constructor(
        private readonly audit: AuditService,
        private readonly organizations: OrganizationContextService,
        @Optional()
        private readonly flags: FeatureFlagService = new FeatureFlagService(),
        @Optional()
        private readonly access: CatalogueAccessService = new CatalogueAccessService(),
    ) {}

    readonly handle = async (job: Job): Promise<void> => {
        const { deliveryId } = job.payload as { deliveryId?: string };
        if (!deliveryId) return;
        const delivery = await prisma.webhookDelivery.findUnique({
            where: { id: deliveryId },
            include: { endpoint: true },
        });
        // Its endpoint deleted (and the log with it), or sent already.
        if (delivery?.status !== "PENDING") return;
        const { endpoint } = delivery;

        const refusal = await this.refusal(
            endpoint,
            delivery.event,
            delivery.createdAt,
        );
        if (refusal) {
            await prisma.webhookDelivery.update({
                where: { id: delivery.id },
                data: { status: "FAILED", lastError: refusal },
            });
            return;
        }

        const now = new Date();
        const last = job.attempts + 1 >= job.maxAttempts;
        const off = endpoint.disabledAt !== null;
        let attempt: Attempt;
        try {
            const body = await this.bodyOf(delivery, endpoint.organizationId);
            attempt = await this.send(endpoint, delivery.id, body, now);
        } catch (error) {
            // Building, signing or sending threw (a key off the ring, a DB
            // blip). The worker backs off; on the last try the log says it
            // failed, in words that never carry the error's own text.
            if (last) {
                await prisma.webhookDelivery.update({
                    where: { id: delivery.id },
                    data: {
                        status: "FAILED",
                        attempts: { increment: 1 },
                        lastAttemptAt: now,
                        lastError:
                            "Saroh couldn't prepare this delivery. Send it again later.",
                    },
                });
                if (!off) await this.countFailure(endpoint, now);
            }
            throw error;
        }
        await prisma.webhookDelivery.update({
            where: { id: delivery.id },
            data: {
                attempts: { increment: 1 },
                lastAttemptAt: now,
                lastStatusCode: attempt.status,
                lastError: attempt.error,
                responseSnippet: attempt.snippet,
                ...(attempt.ok
                    ? { status: "DELIVERED", deliveredAt: now }
                    : last
                      ? { status: "FAILED" }
                      : {}),
            },
        });
        // Only a test reaches an address that is off. One that gets through
        // turns it back on; one that fails leaves it off, its count as it was.
        if (attempt.ok) {
            if (off) await this.onAfterTest(endpoint, delivery.id);
            else if (endpoint.failureStreak !== 0) {
                await prisma.webhookEndpoint.update({
                    where: { id: endpoint.id },
                    data: { failureStreak: 0 },
                });
            }
            return;
        }
        if (last && !off) await this.countFailure(endpoint, now);
        throw new DeliveryFailed(attempt.error ?? "Not delivered");
    };

    /** Why this delivery can't go at all now, or null. */
    private async refusal(
        endpoint: WebhookEndpoint,
        event: string,
        madeAt: Date,
    ): Promise<string | null> {
        const { organizationId } = endpoint;
        // Only a test made after the address went off reaches it (to check it
        // before it's on again); an older one still retrying would turn it on.
        const testWhileOff =
            event === WEBHOOK_PING &&
            endpoint.disabledAt !== null &&
            madeAt >= endpoint.disabledAt;
        if (endpoint.disabledAt && !testWhileOff) {
            return "The endpoint is switched off.";
        }
        if (
            !(await this.flags.isEnabled(FlagKey.API_WEBHOOKS, organizationId))
        ) {
            return "Webhooks are switched off.";
        }
        const access = await this.access.resolve(organizationId, new Date());
        if (!access.entitlements.webhooks) {
            return "Webhooks aren't in the business's plan.";
        }
        let actions: ReadonlySet<string> | undefined;
        try {
            const creator = await this.organizations.resolve(
                endpoint.createdByUserId,
                organizationId,
            );
            actions = creator.actions;
        } catch (error) {
            if (error instanceof HttpException) {
                return "The person who set up this endpoint no longer has access to the business.";
            }
            throw error;
        }
        const needs = EVENT_CAPABILITY[event as WebhookEvent] as
            string | undefined;
        if (needs && !actions?.has(needs)) {
            return "The person who set up this endpoint can no longer see these records.";
        }
        return null;
    }

    /** The body sent: built and kept on the first try, the kept one after. */
    private async bodyOf(
        delivery: {
            id: string;
            event: string;
            payload: Prisma.JsonValue;
            createdAt: Date;
        },
        organizationId: string,
    ): Promise<string> {
        const stored = delivery.payload as Stored;
        if ("body" in stored) return stored.body;
        const envelope: Prisma.JsonObject = {
            id: delivery.id,
            type: delivery.event,
            createdAt: delivery.createdAt.toISOString(),
            data: {},
        };
        if ("ref" in stored) {
            const record = RECORDS[delivery.event as WebhookEvent];
            const view = await record.read(organizationId, stored.ref);
            const base = appBase(await editionOf(organizationId));
            envelope.data = view ?? { id: stored.ref };
            envelope.links = {
                app: `${base}${record.path}${encodeURIComponent(stored.ref)}`,
            };
        }
        const body = JSON.stringify(envelope);
        await prisma.webhookDelivery.update({
            where: { id: delivery.id },
            data: { payload: { body } },
        });
        return body;
    }

    private async send(
        endpoint: WebhookEndpoint,
        deliveryId: string,
        body: string,
        now: Date,
    ): Promise<Attempt> {
        const outcome = await strictFetch(
            endpoint.url,
            {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    "content-length": String(Buffer.byteLength(body)),
                    "accept-encoding": "identity",
                    "user-agent": "Saroh-Webhooks/1",
                    [SIGNATURE_HEADER]: signatureHeader(
                        signingSecrets(endpoint, now),
                        body,
                        now,
                    ),
                    [DELIVERY_ID_HEADER]: deliveryId,
                },
                body,
                timeoutMs: DELIVERY_TIMEOUT_MS,
                maxBytes: SNIPPET_BYTES,
            },
            this.net,
        );
        if (!outcome.ok) {
            return {
                ok: false,
                status: null,
                error: FAILURE_WORDS[outcome.reason] ?? FAILURE_WORDS.network,
                snippet: null,
            };
        }
        const ok = outcome.status >= 200 && outcome.status < 300;
        return {
            ok,
            status: outcome.status,
            error: ok ? null : `The endpoint answered ${outcome.status}.`,
            snippet:
                outcome.body.subarray(0, SNIPPET_BYTES).toString("utf8") ||
                null,
        };
    }

    /** A delivery out of tries: one more in a row, and off at {@link AUTO_OFF_AFTER}. */
    private async countFailure(
        endpoint: WebhookEndpoint,
        now: Date,
    ): Promise<void> {
        const counted = await prisma.webhookEndpoint.update({
            where: { id: endpoint.id },
            data: { failureStreak: { increment: 1 } },
            select: { failureStreak: true },
        });
        if (counted.failureStreak < AUTO_OFF_AFTER) return;
        // Only the delivery that switches it off tells anyone.
        const off = await prisma.webhookEndpoint.updateMany({
            where: { id: endpoint.id, disabledAt: null },
            data: { disabledAt: now },
        });
        if (off.count !== 1) return;
        await this.tellOff(endpoint, counted.failureStreak);
    }

    /** An address that was off, on again because a test got through. */
    private async onAfterTest(
        endpoint: WebhookEndpoint,
        deliveryId: string,
    ): Promise<void> {
        const on = await prisma.webhookEndpoint.updateMany({
            where: { id: endpoint.id, disabledAt: { not: null } },
            data: { disabledAt: null, failureStreak: 0 },
        });
        if (on.count !== 1) return;
        await this.audit.record({
            action: AuditAction.WebhookEndpointOnAfterTest,
            actorUserId: SYSTEM_ACTOR,
            organizationId: endpoint.organizationId,
            targetType: "webhook-endpoint",
            targetId: endpoint.id,
            outcome: AuditOutcome.Success,
            metadata: { host: hostOf(endpoint.url), deliveryId },
        });
    }

    private async tellOff(
        endpoint: WebhookEndpoint,
        failures: number,
    ): Promise<void> {
        const { organizationId } = endpoint;
        const host = hostOf(endpoint.url);
        await this.audit.record({
            action: AuditAction.WebhookEndpointAutoDisabled,
            actorUserId: SYSTEM_ACTOR,
            organizationId,
            targetType: "webhook-endpoint",
            targetId: endpoint.id,
            outcome: AuditOutcome.Success,
            metadata: { host, events: endpoint.events, failures },
        });
        const heading = "A webhook endpoint was switched off";
        const body = `Saroh couldn't deliver to ${host} ${failures} times in a row, so it stopped sending there. Fix the endpoint, then switch it back on in Settings › API and AI apps › Webhooks.`;
        await prisma.notification.create({
            data: {
                organizationId,
                ...noticeOf(WEBHOOK_DISABLED_NOTIFICATION_TYPE, {}),
                title: heading,
                body,
            },
        });
        // Whoever may manage webhooks: the Owner by default, and anyone
        // they gave it to (a permission, never the role's name).
        const [holders, edition] = await Promise.all([
            teamHolding(organizationId, "webhook:manage"),
            editionOf(organizationId),
        ]);
        for (const to of new Set(holders.map((m) => m.email))) {
            if (!to) continue;
            // Best effort: the inbox has it either way.
            await sendTeamAlertEmail(
                to,
                {
                    subject: heading,
                    heading,
                    body,
                    url: `${appBase(edition)}/settings/developers/webhooks`,
                    cta: "Open Webhooks",
                    footer: "You get this because you manage webhooks for this business on Saroh.",
                },
                edition,
            ).catch((error: unknown) =>
                this.logger.warn(
                    `webhook_off_email_failed endpoint=${endpoint.id} ${error instanceof Error ? error.name : "error"}`,
                ),
            );
        }
    }
}

/** The log's words for a send that got no answer. */
const FAILURE_WORDS: Record<string, string> = {
    redirect:
        "The endpoint answered with a redirect. Saroh doesn't follow redirects: use the final address.",
    "private-address": "The address points to a private or internal network.",
    "local-name": "The address points to a private or internal network.",
    scheme: "The address must be https.",
    port: "The address must use the standard https port.",
    dns: "The address's name didn't resolve.",
    network: "The endpoint didn't answer in time, or the connection failed.",
};
