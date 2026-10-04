import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";
import type { Catalog } from "@saroh/pricing-catalog";
import {
    CATALOG_PLAN_KEY_PREFIX,
    catalogPlanIdForKey,
    gstPaise,
    withGstPaise,
} from "@saroh/pricing-catalog";

import type { OrganizationContext } from "../../common/types/organization-context";
import {
    AuditAction,
    AuditOutcome,
    AuditService,
} from "../audit/audit.service";
import { authorize } from "../organizations/organization-policy";
import { queueAddonChargesInTx } from "./addon-charges";
import { billedByProvider, periodStart } from "./checkout-quote";
import {
    addonProblem,
    addonProratedLine,
    catalogueOfVersion,
    MAX_ADDON_QUANTITY,
} from "./offers";

/** One add-on as Settings › Plan shows it. */
export interface AddonView {
    id: string;
    kind: string;
    /** The module a module add-on switches on; null otherwise. */
    module: string | null;
    name: string;
    mode: string;
    /** How much one pack adds (one for a unit). */
    qty: number;
    /** A month of one pack or unit: before GST, its GST and the total. */
    pricePaise: number;
    gstPaise: number;
    totalPaise: number;
    /** How many the business holds. */
    quantity: number;
    /** What those cost a month before GST: `quantity` × `pricePaise` (U14). */
    heldPaise: number;
    /** Whether it can be bought on the business's plan, and if not why. */
    available: boolean;
    why: string | null;
}

/** `GET …/billing/addons`. */
export interface AddonsView {
    /** Whether the business can buy add-ons now, and if not why. */
    canBuy: boolean;
    why: string | null;
    max: number;
    addons: AddonView[];
    /** Every add-on held, a month before GST: the cards' sum (U14). */
    heldPaise: number;
}

const SUB_SELECT = {
    id: true,
    status: true,
    provider: true,
    providerSubscriptionId: true,
    currentPeriodEnd: true,
    pendingPlanId: true,
    pendingFrom: true,
    billingCycle: true,
    plan: {
        select: {
            id: true,
            key: true,
            name: true,
            version: true,
            interval: true,
            priceCents: true,
        },
    },
    addons: { select: { addonId: true, quantity: true } },
} as const;

type Sub = Prisma.SubscriptionGetPayload<{ select: typeof SUB_SELECT }>;

/**
 * Add-ons from Settings › Plan (pricing catalogue U16, KTD-5): bought,
 * changed and removed by the business, on top of a paid plan billed through
 * Saroh's provider. Their definitions come from the version the business's
 * plan is on, never the live one; what it holds is `SubscriptionAddon`,
 * which the access read (U12) adds to its limits at once.
 *
 * Billed monthly with the plan, after the period (`addon-charges.ts`): more
 * bought part-way through a period owes what is left of it, prorated; every
 * period after owes the whole. Removing takes effect at once; what the
 * period already owes stays owed. The client names an add-on and a
 * quantity, nothing else (KTD-18).
 */
@Injectable()
export class AddonsService {
    constructor(@Optional() private readonly audit?: AuditService) {}

    async list(
        ctx: OrganizationContext,
        now: Date = new Date(),
    ): Promise<AddonsView> {
        authorize(ctx, "billing:read");
        const sub = await prisma.subscription.findUnique({
            where: { organizationId: ctx.organizationId },
            select: SUB_SELECT,
        });
        return this.view(sub, now);
    }

    /** Hold `quantity` of an add-on; zero removes it. `billing:manage`. */
    async set(
        ctx: OrganizationContext,
        addonId: string,
        quantity: number,
        now: Date = new Date(),
    ): Promise<AddonsView> {
        authorize(ctx, "billing:manage");
        const changed = await prisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT "id" FROM "Subscription" WHERE "organizationId" = ${ctx.organizationId} FOR UPDATE`;
            const sub = await tx.subscription.findUnique({
                where: { organizationId: ctx.organizationId },
                select: SUB_SELECT,
            });
            const why = cantBuy(sub, now);
            if (why || !sub) throw new ConflictException(why);
            const catalog = await catalogueOfVersion(tx, sub.plan.version);
            const planId = catalogPlanIdForKey(sub.plan.key);
            if (!catalog || !planId) {
                throw new ConflictException(
                    "Add-ons can't be bought just now. Try again later.",
                );
            }
            const addon = catalog.addons.find((a) => a.id === addonId);
            if (!addon) {
                throw new NotFoundException(
                    `There's no add-on "${addonId}" on ${sub.plan.name}.`,
                );
            }
            const held =
                sub.addons.find((a) => a.addonId === addonId)?.quantity ?? 0;
            if (quantity === held) return null;
            // Less is always allowed; more only where the plan can take it.
            const problem =
                quantity > held
                    ? addonProblem(catalog, planId, addon, quantity)
                    : null;
            if (problem) {
                throw new BadRequestException({
                    message: problem,
                    details: { field: "quantity" },
                });
            }

            if (quantity === 0) {
                await tx.subscriptionAddon.deleteMany({
                    where: { subscriptionId: sub.id, addonId },
                });
            } else {
                await tx.subscriptionAddon.upsert({
                    where: {
                        subscriptionId_addonId: {
                            subscriptionId: sub.id,
                            addonId,
                        },
                    },
                    create: {
                        organizationId: ctx.organizationId,
                        subscriptionId: sub.id,
                        addonId,
                        quantity,
                    },
                    update: { quantity },
                });
            }

            // More, part-way through a paid period: what is left of it.
            const end = sub.currentPeriodEnd;
            if (
                quantity > held &&
                sub.status === "ACTIVE" &&
                end &&
                end > now &&
                sub.provider &&
                sub.providerSubscriptionId
            ) {
                const cycle = sub.billingCycle === "year" ? "year" : "month";
                const line = addonProratedLine({
                    addon,
                    added: quantity - held,
                    cycle,
                    periodStart: periodStart(end, cycle),
                    periodEnd: end,
                    now,
                });
                if (line) {
                    await queueAddonChargesInTx(tx, {
                        organizationId: ctx.organizationId,
                        subscriptionId: sub.id,
                        provider: sub.provider,
                        providerSubscriptionId: sub.providerSubscriptionId,
                        chargeAt: end,
                        lines: [line],
                    });
                }
            }
            return { subscriptionId: sub.id, from: held };
        });
        if (changed) {
            await this.audit?.record({
                action: AuditAction.PlanAddonChange,
                actorUserId: ctx.userId,
                organizationId: ctx.organizationId,
                targetType: "subscription",
                targetId: changed.subscriptionId,
                outcome: AuditOutcome.Success,
                metadata: { addonId, from: changed.from, to: quantity },
                actorRoleKey: ctx.roleKey,
            });
        }
        return this.list(ctx, now);
    }

    private async view(sub: Sub | null, now: Date): Promise<AddonsView> {
        const why = cantBuy(sub, now);
        const catalog = sub?.plan.key.startsWith(CATALOG_PLAN_KEY_PREFIX)
            ? await catalogueOfVersion(prisma, sub.plan.version)
            : null;
        const planId = sub ? catalogPlanIdForKey(sub.plan.key) : null;
        const addons =
            catalog && planId && sub
                ? addonViews(catalog, planId, sub, Boolean(why))
                : [];
        return {
            canBuy: !why && Boolean(catalog),
            why,
            max: MAX_ADDON_QUANTITY,
            addons,
            heldPaise: addons.reduce((t, a) => t + a.heldPaise, 0),
        };
    }
}

function addonViews(
    catalog: Catalog,
    planId: string,
    sub: Sub,
    blocked: boolean,
): AddonView[] {
    return catalog.addons.map((a) => {
        const quantity =
            sub.addons.find((h) => h.addonId === a.id)?.quantity ?? 0;
        const problem = addonProblem(catalog, planId, a, 1);
        return {
            id: a.id,
            kind: a.kind,
            module: a.module ?? null,
            name: a.name,
            mode: a.mode,
            qty: a.mode === "unit" ? 1 : a.qty,
            pricePaise: a.pricePaise,
            gstPaise: gstPaise(a.pricePaise),
            totalPaise: withGstPaise(a.pricePaise),
            quantity,
            heldPaise: quantity * a.pricePaise,
            available: !blocked && !problem,
            why: problem,
        };
    });
}

/**
 * Why the business can't buy add-ons now, or null: they come with a paid
 * catalogue plan billed through Saroh's provider, trialing or paid up.
 */
function cantBuy(sub: Sub | null, now: Date): string | null {
    const paid =
        sub &&
        sub.plan.key.startsWith(CATALOG_PLAN_KEY_PREFIX) &&
        billedByProvider(sub) &&
        sub.currentPeriodEnd &&
        sub.currentPeriodEnd > now;
    if (!sub || !paid) return "Add-ons come with a paid plan.";
    if (sub.status === "PAST_DUE") {
        return "Your plan's last payment didn't go through. Once it's paid, you can add more.";
    }
    if (sub.status !== "ACTIVE" && sub.status !== "TRIALING") {
        return "Add-ons come with a paid plan.";
    }
    return null;
}
