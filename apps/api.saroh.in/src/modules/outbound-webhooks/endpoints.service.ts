import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
    Optional,
    ServiceUnavailableException,
} from "@nestjs/common";
import type {
    CreatedWebhookEndpoint,
    CreateWebhookEndpointBody,
    UpdateWebhookEndpointBody,
    WebhookDeliveryList,
    WebhookDeliveryView,
    WebhookEndpointList,
    WebhookEndpointView,
    WebhookEvent,
} from "@saroh/api-contract";
import { WEBHOOK_PING } from "@saroh/api-contract";
import type { WebhookDelivery, WebhookEndpoint } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { EncryptedSecret, EncryptionKey } from "../../common/crypto";
import { decryptWithKey, encryptWithKey } from "../../common/crypto";
import type { Resolver } from "../../common/net/ssrf";
import {
    checkStrictUrl,
    resolveTarget,
    systemResolver,
} from "../../common/net/ssrf";
import type { OrganizationContext } from "../../common/types/organization-context";
import { env } from "../../env";
import {
    AuditAction,
    AuditOutcome,
    AuditService,
} from "../audit/audit.service";
import type { BusinessAccess } from "../billing/catalogue-access.service";
import { CatalogueAccessService } from "../billing/catalogue-access.service";
import {
    MODULE_LOCKED,
    moduleLocked,
    planLimitReached,
} from "../billing/plan-limit-errors";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { FlagKey } from "../feature-flags/flags";
import { allows, authorize } from "../organizations/organization-policy";
import {
    EVENT_CAPABILITY,
    queueDelivery,
    WEBHOOK_DELIVER_ATTEMPTS,
    WEBHOOK_DELIVER_TYPE,
} from "./emitter";
import { mintSecret } from "./signing";

/** How long a rolled secret keeps signing beside its replacement. */
export const SECRET_ROLL_GRACE_MS = 24 * 60 * 60 * 1000;

/** The pricing-catalogue row: on the plan, and how many addresses (`webhooks.max`). */
const WEBHOOKS_ROW = "webhooks";
const WEBHOOKS_LIMIT_KEY = "webhooks.max";

export function webhookSecretKey(): EncryptionKey {
    return {
        name: "WEBHOOK_SECRET_KEY",
        value: env.WEBHOOK_SECRET_KEY,
        protects: "webhook signing secrets",
    };
}

/** A missing or malformed key is a 503 that names the variable, never its value. */
function withSecretKey<T>(run: (key: EncryptionKey) => T): T {
    const key = webhookSecretKey();
    try {
        return run(key);
    } catch (error) {
        if (error instanceof Error && error.message.startsWith(key.name)) {
            throw new ServiceUnavailableException(
                `Webhooks can't be signed yet: ${key.name} is not set correctly on the API.`,
            );
        }
        throw error;
    }
}

export const sealSecret = (secret: string): EncryptedSecret =>
    withSecretKey((key) => encryptWithKey(secret, key));

/**
 * The secrets that sign a delivery sent at `now`: the current one, then the
 * one a roll replaced while it is still in its 24 hours.
 */
export function signingSecrets(
    e: WebhookEndpoint,
    now: Date = new Date(),
): string[] {
    return withSecretKey((key) => {
        const out = [
            decryptWithKey(
                {
                    ciphertext: e.secretCiphertext,
                    iv: e.secretIv,
                    authTag: e.secretAuthTag,
                },
                key,
            ),
        ];
        if (
            e.previousSecretCiphertext &&
            e.previousSecretIv &&
            e.previousSecretAuthTag &&
            e.previousSecretUntil &&
            e.previousSecretUntil.getTime() > now.getTime()
        ) {
            out.push(
                decryptWithKey(
                    {
                        ciphertext: e.previousSecretCiphertext,
                        iv: e.previousSecretIv,
                        authTag: e.previousSecretAuthTag,
                    },
                    key,
                ),
            );
        }
        return out;
    });
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export function endpointView(e: WebhookEndpoint): WebhookEndpointView {
    return {
        id: e.id,
        url: e.url,
        events: e.events,
        enabled: e.disabledAt === null,
        disabledAt: iso(e.disabledAt),
        failureStreak: e.failureStreak,
        createdByUserId: e.createdByUserId,
        previousSecretUntil: iso(e.previousSecretUntil),
        createdAt: e.createdAt.toISOString(),
    };
}

export function deliveryView(d: WebhookDelivery): WebhookDeliveryView {
    return {
        id: d.id,
        endpointId: d.endpointId,
        event: d.event,
        status: d.status,
        attempts: d.attempts,
        lastStatusCode: d.lastStatusCode,
        lastError: d.lastError,
        responseSnippet: d.responseSnippet,
        lastAttemptAt: iso(d.lastAttemptAt),
        deliveredAt: iso(d.deliveredAt),
        createdAt: d.createdAt.toISOString(),
    };
}

/** The words a refused address gets, the same on save and in the log. */
export const REFUSED_ADDRESS =
    "Use a public https address on the standard port. Private, local and internal addresses can't receive webhooks.";

/**
 * Settings › API and AI apps › Webhooks (plan 2026-11-10-001, U13). Every
 * call needs `webhook:manage` and the `API_WEBHOOKS` kill switch (404 when
 * off). Making an endpoint, or switching one back on, also needs the plan's
 * `webhooks` row (else `MODULE_LOCKED`) and room under `webhooks.max` (else
 * `PLAN_LIMIT_REACHED`); every endpoint counts, on or off. The address is
 * checked by the shared SSRF guard on save, its name resolved too, and
 * again on every send. Subscribing to an event needs that event's read
 * capability. The signing secret is sealed with `WEBHOOK_SECRET_KEY` and
 * returned once, on create and on roll.
 */
@Injectable()
export class WebhookEndpointsService {
    constructor(
        private readonly audit: AuditService,
        @Optional()
        private readonly flags: FeatureFlagService = new FeatureFlagService(),
        @Optional()
        private readonly access: CatalogueAccessService = new CatalogueAccessService(),
    ) {}

    /** Where a saved address's name is looked up; tests put a stub here. */
    resolver: Resolver = systemResolver;

    async list(ctx: OrganizationContext): Promise<WebhookEndpointList> {
        await this.open(ctx);
        const rows = await prisma.webhookEndpoint.findMany({
            where: { organizationId: ctx.organizationId },
            orderBy: { createdAt: "desc" },
            take: 200,
        });
        return { data: rows.map(endpointView) };
    }

    async create(
        ctx: OrganizationContext,
        body: CreateWebhookEndpointBody,
        now: Date = new Date(),
    ): Promise<CreatedWebhookEndpoint> {
        await this.open(ctx);
        const cap = this.capOf(await this.included(ctx.organizationId, now));
        const events = this.subscribable(ctx, body.events);
        const url = await this.vetted(body.url);
        const secret = mintSecret();
        const sealed = sealSecret(secret);
        const endpoint = await prisma.$transaction(async (tx) => {
            if (cap) {
                // One business's creates queue here, so two at once can't
                // both fit the last place.
                const lock = `webhooks:${ctx.organizationId}`;
                await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lock}))`;
                const used = await tx.webhookEndpoint.count({
                    where: { organizationId: ctx.organizationId },
                });
                if (used + 1 > cap.limit) {
                    throw planLimitReached(
                        cap.row,
                        WEBHOOKS_LIMIT_KEY,
                        cap.limit,
                        used,
                    );
                }
            }
            return tx.webhookEndpoint.create({
                data: {
                    organizationId: ctx.organizationId,
                    createdByUserId: ctx.userId,
                    url,
                    events,
                    secretCiphertext: sealed.ciphertext,
                    secretIv: sealed.iv,
                    secretAuthTag: sealed.authTag,
                },
            });
        });
        await this.record(ctx, AuditAction.WebhookEndpointCreated, endpoint);
        return { endpoint: endpointView(endpoint), secret };
    }

    /**
     * A new address or events, or switched off or back on. Back on clears
     * the failure count and needs the plan, as making one does. Whoever
     * changes it becomes the one whose access each send is checked against.
     */
    async update(
        ctx: OrganizationContext,
        endpointId: string,
        body: UpdateWebhookEndpointBody,
        now: Date = new Date(),
    ): Promise<WebhookEndpointView> {
        await this.open(ctx);
        const old = await this.find(ctx, endpointId);
        const turningOn = body.enabled === true && old.disabledAt !== null;
        if (turningOn) await this.included(ctx.organizationId, now);
        const events = body.events
            ? this.subscribable(ctx, body.events)
            : undefined;
        const url = body.url ? await this.vetted(body.url) : undefined;
        const endpoint = await prisma.webhookEndpoint.update({
            where: { id: old.id },
            data: {
                createdByUserId: ctx.userId,
                ...(url ? { url } : {}),
                ...(events ? { events } : {}),
                ...(body.enabled === false && old.disabledAt === null
                    ? { disabledAt: now }
                    : {}),
                ...(turningOn ? { disabledAt: null, failureStreak: 0 } : {}),
            },
        });
        await this.record(ctx, AuditAction.WebhookEndpointUpdated, endpoint, {
            ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
        });
        return endpointView(endpoint);
    }

    /** Gone with its delivery log. Never refused for a business that is closing. */
    async remove(
        ctx: OrganizationContext,
        endpointId: string,
    ): Promise<{ id: string }> {
        await this.open(ctx);
        const old = await this.find(ctx, endpointId);
        await prisma.webhookEndpoint.delete({ where: { id: old.id } });
        await this.record(ctx, AuditAction.WebhookEndpointDeleted, old);
        return { id: old.id };
    }

    /**
     * A new signing secret, shown once. The old one keeps signing beside it
     * for {@link SECRET_ROLL_GRACE_MS}; a roll during that time replaces the
     * newer one and ends the older at once.
     */
    async roll(
        ctx: OrganizationContext,
        endpointId: string,
        now: Date = new Date(),
    ): Promise<CreatedWebhookEndpoint> {
        await this.open(ctx);
        const old = await this.find(ctx, endpointId);
        const secret = mintSecret();
        const sealed = sealSecret(secret);
        const until = new Date(now.getTime() + SECRET_ROLL_GRACE_MS);
        const endpoint = await prisma.webhookEndpoint.update({
            where: { id: old.id },
            data: {
                secretCiphertext: sealed.ciphertext,
                secretIv: sealed.iv,
                secretAuthTag: sealed.authTag,
                previousSecretCiphertext: old.secretCiphertext,
                previousSecretIv: old.secretIv,
                previousSecretAuthTag: old.secretAuthTag,
                previousSecretUntil: until,
            },
        });
        await this.record(ctx, AuditAction.WebhookSecretRolled, endpoint, {
            previousSecretUntil: until.toISOString(),
        });
        return { endpoint: endpointView(endpoint), secret };
    }

    /** The newest 100 deliveries to one endpoint. */
    async deliveries(
        ctx: OrganizationContext,
        endpointId: string,
    ): Promise<WebhookDeliveryList> {
        await this.open(ctx);
        const endpoint = await this.find(ctx, endpointId);
        const rows = await prisma.webhookDelivery.findMany({
            where: {
                organizationId: ctx.organizationId,
                endpointId: endpoint.id,
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 100,
        });
        return { data: rows.map(deliveryView) };
    }

    /**
     * Sends a delivery again, as it was, under the same delivery id (so a
     * receiver that kept it sees a repeat), signed at the new time.
     */
    async resend(
        ctx: OrganizationContext,
        endpointId: string,
        deliveryId: string,
    ): Promise<WebhookDeliveryView> {
        await this.open(ctx);
        const endpoint = await this.find(ctx, endpointId);
        this.assertOn(endpoint);
        const delivery = await prisma.$transaction(async (tx) => {
            const found = await tx.webhookDelivery.findFirst({
                where: {
                    id: deliveryId,
                    endpointId: endpoint.id,
                    organizationId: ctx.organizationId,
                },
            });
            if (!found) throw new NotFoundException("Delivery not found");
            const again = await tx.webhookDelivery.update({
                where: { id: found.id },
                data: { status: "PENDING" },
            });
            await tx.job.create({
                data: {
                    organizationId: ctx.organizationId,
                    type: WEBHOOK_DELIVER_TYPE,
                    payload: { deliveryId: found.id },
                    maxAttempts: WEBHOOK_DELIVER_ATTEMPTS,
                },
            });
            return again;
        });
        return deliveryView(delivery);
    }

    /** "Send a test": a `ping` to this endpoint, whatever it subscribes to. */
    async test(
        ctx: OrganizationContext,
        endpointId: string,
    ): Promise<WebhookDeliveryView> {
        await this.open(ctx);
        const endpoint = await this.find(ctx, endpointId);
        this.assertOn(endpoint);
        const id = await prisma.$transaction((tx) =>
            queueDelivery(tx, {
                organizationId: ctx.organizationId,
                endpointId: endpoint.id,
                event: WEBHOOK_PING,
                payload: { ping: true },
            }),
        );
        return deliveryView(
            await prisma.webhookDelivery.findUniqueOrThrow({ where: { id } }),
        );
    }

    /** `webhook:manage`, then the kill switch: a business with it off sees nothing. */
    private async open(ctx: OrganizationContext): Promise<void> {
        authorize(ctx, "webhook:manage");
        if (
            !(await this.flags.isEnabled(
                FlagKey.API_WEBHOOKS,
                ctx.organizationId,
            ))
        ) {
            throw new NotFoundException();
        }
    }

    private assertOn(endpoint: WebhookEndpoint): void {
        if (endpoint.disabledAt) {
            throw new ConflictException(
                "This endpoint is switched off. Switch it on to send to it.",
            );
        }
    }

    /**
     * The events asked for, each one the person may read. One they can't is
     * refused by name rather than dropped, so nobody believes they are
     * subscribed to something they won't get.
     */
    private subscribable(
        ctx: OrganizationContext,
        events: readonly WebhookEvent[],
    ): WebhookEvent[] {
        const unique = [...new Set(events)];
        const denied = unique.filter((e) => !allows(ctx, EVENT_CAPABILITY[e]));
        if (denied.length > 0) {
            throw new ForbiddenException({
                message: `You can't subscribe to ${denied.join(", ")}: your role can't see those records.`,
                details: { events: denied },
            });
        }
        return unique;
    }

    /** The address as stored, refused when the guard would refuse to send to it. */
    private async vetted(raw: string): Promise<string> {
        const target = checkStrictUrl(raw);
        if (!target.ok) {
            throw new BadRequestException({
                message: REFUSED_ADDRESS,
                field: "url",
                details: { reason: target.reason },
            });
        }
        const resolved = await resolveTarget(target.url, this.resolver);
        if (!resolved.ok) {
            throw new BadRequestException({
                message:
                    resolved.reason === "dns"
                        ? "That address doesn't resolve. Check the name and try again."
                        : REFUSED_ADDRESS,
                field: "url",
                details: { reason: resolved.reason },
            });
        }
        return target.url.href;
    }

    private async find(ctx: OrganizationContext, endpointId: string) {
        const endpoint = await prisma.webhookEndpoint.findFirst({
            where: { id: endpointId, organizationId: ctx.organizationId },
        });
        if (!endpoint) throw new NotFoundException("Endpoint not found");
        return endpoint;
    }

    /** The plan's row: absent (a catalogue without it), off or a zero cap is refused. */
    private async included(
        organizationId: string,
        now: Date,
    ): Promise<BusinessAccess> {
        const a = await this.access.resolve(organizationId, now);
        const value = a.entitlements[WEBHOOKS_ROW];
        if (!value || (typeof value === "number" && value <= 0)) {
            throw locked(a);
        }
        return a;
    }

    /** The cap on addresses, or null when the plan sets none. */
    private capOf(a: BusinessAccess) {
        const value = a.entitlements[WEBHOOKS_ROW];
        if (value === true) return null;
        const row =
            a.source === "catalogue"
                ? a.modules.find((m) => m.moduleId === WEBHOOKS_ROW)
                : undefined;
        if (typeof value !== "number" || !row) throw locked(a);
        return { limit: value, row };
    }

    /** Never the secret: the address's host and the events. */
    private record(
        ctx: OrganizationContext,
        action: AuditAction,
        endpoint: WebhookEndpoint,
        extra: Record<string, string | boolean> = {},
    ): Promise<void> {
        return this.audit.record({
            action,
            actorUserId: ctx.userId,
            organizationId: ctx.organizationId,
            targetType: "webhook-endpoint",
            targetId: endpoint.id,
            outcome: AuditOutcome.Success,
            metadata: {
                host: hostOf(endpoint.url),
                events: endpoint.events,
                ...extra,
            },
            actorRoleKey: ctx.roleKey,
        });
    }
}

export function hostOf(url: string): string {
    try {
        return new URL(url).host;
    } catch {
        return "";
    }
}

function locked(a: BusinessAccess): ForbiddenException {
    const row =
        a.source === "catalogue"
            ? a.modules.find((m) => m.moduleId === WEBHOOKS_ROW)
            : undefined;
    if (row) return moduleLocked(row);
    return new ForbiddenException({
        message: "Webhooks aren't in your plan.",
        details: {
            code: MODULE_LOCKED,
            moduleId: WEBHOOKS_ROW,
            plan: null,
            upgradeTo: null,
        },
    });
}
