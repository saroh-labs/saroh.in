import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { Prisma, prisma } from "@saroh/database";

import type { DiscountInputDto } from "./dto";
import type {
    CodeRefusal,
    DiscountKind,
    DiscountReach,
    OrderView,
} from "./redeem";
import { codeRefusalMessage, redeem } from "./redeem";
import type { DiscountView } from "./serialize";
import { DISCOUNT_INCLUDE, serializeDiscount } from "./serialize";

/** A refusal the form can put on the field it is about. */
function fieldError(
    Exception: typeof BadRequestException,
    message: string,
    field: string,
): never {
    // `details`, not `field`: the exception filter forwards only `message`
    // and `details`, so a `field` key would never reach the client.
    throw new Exception({ message, details: { field } });
}

/** What an order records about the code it used, and what came off. */
export interface AppliedDiscount {
    discountId: string;
    code: string;
    kind: DiscountKind;
    percentBps: number | null;
    ruleAmount: string | null;
    usageLimit: number | null;
    amountCents: number;
}

/** A code checked against an order: what comes off, or why nothing does. */
export type CodeCheck =
    | { ok: true; applied: AppliedDiscount }
    | { ok: false; code: string; reason: CodeRefusal };

/** "12.5" → 1250. The DTO has already refused more than two decimals. */
function percentToBps(percent: string): number {
    return Math.round(Number(percent) * 100);
}

interface Resolved {
    code: string;
    description: string | null;
    kind: DiscountKind;
    percentBps: number | null;
    amount: string | null;
    currency: string | null;
    appliesTo: DiscountReach;
    targetIds: string[];
    startsAt: Date | null;
    endsAt: Date | null;
    usageLimit: number | null;
}

/**
 * Discount codes belong to the business (plan 2026-09-20-001, ADR-001).
 *
 * Every read and write is scoped by the organization from the request
 * context. A code's reach — storefronts, collections, products — is checked
 * to belong to that same business before it is written: a target id from
 * another business is a 404, not a 403, and never a row.
 *
 * Nothing is deleted to end a code. Ending is a date; a code keeps its
 * figures and its history (R8).
 */
@Injectable()
export class DiscountsService {
    async list(organizationId: string): Promise<DiscountView[]> {
        const rows = await prisma.discount.findMany({
            where: { organizationId },
            orderBy: { createdAt: "desc" },
            include: DISCOUNT_INCLUDE,
        });
        const now = new Date();
        return rows.map((r) => serializeDiscount(r, now));
    }

    async get(organizationId: string, id: string): Promise<DiscountView> {
        const row = await prisma.discount.findFirst({
            where: { id, organizationId },
            include: DISCOUNT_INCLUDE,
        });
        if (!row) throw new NotFoundException("Discount not found");
        return serializeDiscount(row, new Date());
    }

    async create(
        organizationId: string,
        dto: DiscountInputDto,
    ): Promise<DiscountView> {
        if (!dto.code)
            fieldError(BadRequestException, "A code is required", "code");
        if (!dto.kind) {
            fieldError(
                BadRequestException,
                "Choose percentage or amount",
                "kind",
            );
        }
        const resolved = this.resolve(dto, {
            code: dto.code,
            description: null,
            kind: dto.kind,
            percentBps: null,
            amount: null,
            currency: null,
            appliesTo: dto.appliesTo ?? "BUSINESS",
            targetIds: [],
            startsAt: null,
            endsAt: null,
            usageLimit: null,
        });
        await this.assertTargets(organizationId, resolved);
        await this.assertCodeFree(organizationId, resolved.code);

        const id = await prisma.$transaction(async (tx) => {
            const created = await tx.discount.create({
                data: { organizationId, ...this.columns(resolved) },
                select: { id: true },
            });
            await this.writeReach(tx, created.id, resolved);
            return created.id;
        });
        return this.get(organizationId, id);
    }

    async update(
        organizationId: string,
        id: string,
        dto: DiscountInputDto,
    ): Promise<DiscountView> {
        const current = await this.get(organizationId, id);
        const resolved = this.resolve(dto, {
            code: current.code,
            description: current.description,
            kind: current.kind,
            percentBps:
                current.percent === null ? null : percentToBps(current.percent),
            amount: current.amount,
            currency: current.currency,
            appliesTo: current.appliesTo,
            targetIds: current.targets.map((t) => t.id),
            startsAt: current.startsAt ? new Date(current.startsAt) : null,
            endsAt: current.endsAt ? new Date(current.endsAt) : null,
            usageLimit: current.usageLimit,
        });
        await this.assertTargets(organizationId, resolved);
        if (resolved.code !== current.code) {
            await this.assertCodeFree(organizationId, resolved.code);
        }

        const reachChanged =
            dto.appliesTo !== undefined || dto.targetIds !== undefined;
        await prisma.$transaction(async (tx) => {
            await tx.discount.update({
                where: { id },
                data: this.columns(resolved),
            });
            if (reachChanged) {
                // Reach is written as a whole: replaced, never diffed.
                await tx.discountStore.deleteMany({
                    where: { discountId: id },
                });
                await tx.discountCategory.deleteMany({
                    where: { discountId: id },
                });
                await tx.discountProduct.deleteMany({
                    where: { discountId: id },
                });
                await this.writeReach(tx, id, resolved);
            }
        });
        return this.get(organizationId, id);
    }

    /**
     * Would this code take anything off this order, and how much?
     *
     * The merchant's order form calls this through order create; the site's
     * checkout calls {@link checkForOrder}, the same decision without the
     * throw. Resolved by the business the STOREFRONT belongs to — from the
     * write guard, or from the site — never from anything the client sent.
     * Every refusal is a 400 on the `discountCode` field with a sentence
     * the merchant can act on.
     */
    async redeemForOrder(
        organizationId: string | null,
        rawCode: string,
        order: OrderView,
    ): Promise<AppliedDiscount> {
        const check = await this.checkForOrder(organizationId, rawCode, order);
        if (!check.ok) {
            fieldError(
                BadRequestException,
                codeRefusalMessage(check.code, check.reason),
                "discountCode",
            );
        }
        return check.applied;
    }

    /**
     * The one evaluation behind every code (DEC-104): the counter and the
     * site's checkout both come here, so a code's dates, its use limit and
     * its reach read the same wherever it is typed. Answers rather than
     * throws, so the site's quote can price the bag and say why a code
     * took nothing off.
     */
    async checkForOrder(
        organizationId: string | null,
        rawCode: string,
        order: OrderView,
    ): Promise<CodeCheck> {
        const code = rawCode.trim().toUpperCase();
        // A legacy storefront with no business has nowhere to look a code up:
        // `organizationId = NULL` matches nothing, and saying so beats
        // quietly charging full price (#173).
        if (!organizationId) return { ok: false, code, reason: "NO_BUSINESS" };
        const discount = await prisma.discount.findUnique({
            where: { organizationId_code: { organizationId, code } },
            include: {
                stores: { select: { storeId: true } },
                categories: { select: { categoryId: true } },
                products: { select: { productId: true } },
                _count: { select: { redemptions: true } },
            },
        });
        if (!discount) return { ok: false, code, reason: "UNKNOWN" };

        // A collection includes the collections inside it: naming "Bakery"
        // means the bread in it too. Walked here, over the business's
        // categories (#529), so the pure core only ever sees a resolved set.
        let categoryIds = discount.categories.map((c) => c.categoryId);
        if (discount.appliesTo === "COLLECTION" && categoryIds.length > 0) {
            const all = await prisma.category.findMany({
                where: { organizationId },
                select: { id: true, parentId: true },
            });
            const named = new Set(categoryIds);
            let grew = true;
            while (grew) {
                grew = false;
                for (const c of all) {
                    if (
                        c.parentId &&
                        named.has(c.parentId) &&
                        !named.has(c.id)
                    ) {
                        named.add(c.id);
                        grew = true;
                    }
                }
            }
            categoryIds = [...named];
        }

        const result = redeem(
            {
                kind: discount.kind as DiscountKind,
                percentBps: discount.percentBps,
                amountCents:
                    discount.amount === null
                        ? null
                        : Math.round(Number(discount.amount.toString()) * 100),
                currency: discount.currency,
                appliesTo: discount.appliesTo as DiscountReach,
                storeIds: discount.stores.map((s) => s.storeId),
                categoryIds,
                productIds: discount.products.map((p) => p.productId),
                startsAt: discount.startsAt,
                endsAt: discount.endsAt,
                usageLimit: discount.usageLimit,
                used: discount._count.redemptions,
            },
            order,
            new Date(),
        );
        if (!result.ok) return { ok: false, code, reason: result.reason };
        return {
            ok: true,
            applied: {
                discountId: discount.id,
                code,
                kind: discount.kind as DiscountKind,
                percentBps: discount.percentBps,
                ruleAmount:
                    discount.amount === null
                        ? null
                        : discount.amount.toString(),
                usageLimit: discount.usageLimit,
                amountCents: result.amountCents,
            },
        };
    }

    /** The input laid over what is already there, and checked as a whole. */
    private resolve(dto: DiscountInputDto, base: Resolved): Resolved {
        const kind = dto.kind ?? base.kind;
        const appliesTo = dto.appliesTo ?? base.appliesTo;
        const r: Resolved = {
            code: dto.code ?? base.code,
            description:
                dto.description === undefined
                    ? base.description
                    : // An empty note is no note.
                      dto.description === null || dto.description === ""
                      ? null
                      : dto.description,
            kind,
            percentBps:
                dto.percent !== undefined
                    ? percentToBps(dto.percent)
                    : base.percentBps,
            amount: dto.amount ?? base.amount,
            currency: dto.currency ?? base.currency,
            appliesTo,
            // Choosing the whole business clears any targets.
            targetIds:
                appliesTo === "BUSINESS"
                    ? []
                    : (dto.targetIds ??
                      (dto.appliesTo !== undefined ? [] : base.targetIds)),
            startsAt:
                dto.startsAt === undefined
                    ? base.startsAt
                    : dto.startsAt === null
                      ? null
                      : new Date(dto.startsAt),
            endsAt:
                dto.endsAt === undefined
                    ? base.endsAt
                    : dto.endsAt === null
                      ? null
                      : new Date(dto.endsAt),
            usageLimit:
                dto.usageLimit === undefined ? base.usageLimit : dto.usageLimit,
        };

        if (r.kind === "PERCENTAGE") {
            if (
                r.percentBps === null ||
                r.percentBps <= 0 ||
                r.percentBps > 10_000
            ) {
                fieldError(
                    BadRequestException,
                    "A percentage is more than 0 and at most 100",
                    "percent",
                );
            }
            r.amount = null;
            r.currency = null;
        } else {
            if (r.amount === null || Number(r.amount) <= 0) {
                fieldError(
                    BadRequestException,
                    "An amount off has to be more than 0",
                    "amount",
                );
            }
            if (!r.currency) {
                fieldError(
                    BadRequestException,
                    "An amount off needs its currency",
                    "currency",
                );
            }
            r.percentBps = null;
        }
        if (r.appliesTo !== "BUSINESS" && r.targetIds.length === 0) {
            fieldError(
                BadRequestException,
                "Choose at least one to apply it to",
                "targetIds",
            );
        }
        if (r.startsAt && r.endsAt && r.endsAt < r.startsAt) {
            fieldError(
                BadRequestException,
                "A code has to end after it starts",
                "endsAt",
            );
        }
        return r;
    }

    /** Every target must be this business's own — or it is not found. */
    private async assertTargets(
        organizationId: string,
        r: Resolved,
    ): Promise<void> {
        if (r.targetIds.length === 0) return;
        const ids = [...new Set(r.targetIds)];
        r.targetIds = ids;
        const found =
            r.appliesTo === "STOREFRONT"
                ? await prisma.store.count({
                      where: {
                          id: { in: ids },
                          organizationId,
                          deletedAt: null,
                      },
                  })
                : r.appliesTo === "COLLECTION"
                  ? await prisma.category.count({
                        where: { id: { in: ids }, organizationId },
                    })
                  : await prisma.product.count({
                        where: { id: { in: ids }, organizationId },
                    });
        if (found !== ids.length) {
            throw new NotFoundException({
                message: "Something this code applies to was not found",
                details: { field: "targetIds" },
            });
        }
    }

    private async assertCodeFree(
        organizationId: string,
        code: string,
    ): Promise<void> {
        const taken = await prisma.discount.findUnique({
            where: { organizationId_code: { organizationId, code } },
            select: { id: true },
        });
        if (taken) {
            fieldError(
                ConflictException,
                `${code} is already a code in this business`,
                "code",
            );
        }
    }

    private columns(r: Resolved) {
        return {
            code: r.code,
            description: r.description,
            kind: r.kind,
            percentBps: r.percentBps,
            amount: r.amount === null ? null : new Prisma.Decimal(r.amount),
            currency: r.currency,
            appliesTo: r.appliesTo,
            startsAt: r.startsAt,
            endsAt: r.endsAt,
            usageLimit: r.usageLimit,
        };
    }

    private async writeReach(
        tx: Prisma.TransactionClient,
        discountId: string,
        r: Resolved,
    ): Promise<void> {
        if (r.targetIds.length === 0) return;
        if (r.appliesTo === "STOREFRONT") {
            await tx.discountStore.createMany({
                data: r.targetIds.map((storeId) => ({ discountId, storeId })),
            });
        } else if (r.appliesTo === "COLLECTION") {
            await tx.discountCategory.createMany({
                data: r.targetIds.map((categoryId) => ({
                    discountId,
                    categoryId,
                })),
            });
        } else if (r.appliesTo === "PRODUCT") {
            await tx.discountProduct.createMany({
                data: r.targetIds.map((productId) => ({
                    discountId,
                    productId,
                })),
            });
        }
    }
}
