import {
    BadRequestException,
    ConflictException,
    Injectable,
    Logger,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { gstInsideOrder } from "../invoices/order-invoice";
import {
    correctOrderInvoiceForEdit,
    loadTaxProfile,
    settleSupplementaryInvoices,
} from "../invoices/order-invoicing";
import { allows, authorize } from "../organizations/organization-policy";
import {
    DIFFERENCE_KEY_PREFIX,
    owedBackOn,
    supersedeOpenDifferenceIntents,
} from "../payments/intent-state";
import type { CreateIntentResult } from "../payments/payments.service";
import { PaymentsService } from "../payments/payments.service";
import type { EditOrderDto, MoveStageDto } from "./dto";
import {
    adjustReservation,
    applyInventoryTransition,
    phaseOf,
} from "./order-inventory";
import {
    fromCents,
    priceOrderLines,
    toCents,
    withGstRates,
} from "./order-pricing";
import type { OrderReadDto } from "./order-read";
import { serializeOrderRead } from "./order-read";
import { canEditItems, planStageMove, planUndo } from "./order-stage";

/**
 * The kitchen flow on one order (ADR-008, U6): the read Order Detail renders,
 * moving its stage, undoing the last step, and changing it before anyone
 * starts on it.
 *
 * Split from OrdersService along its own specs: that service places orders
 * and lists them; this one works a single order through the kitchen, under
 * the organization from the request context — never a store id the caller
 * sent.
 *
 * Who may do what (DEC-024):
 *  - `order:stage` (Owner, Admin, Member) — read the kitchen view, move the
 *    stage, undo the last step.
 *  - `order:write` (Owner, Admin) — edit lines, fulfilment, address, notes.
 *    Taking or returning the difference also needs `payment:manage`.
 *  - Money in the read only with `payment:read` (ADR-008).
 *
 * Every write takes the order's row lock first, so a stage move, an undo, an
 * edit and a refund on one order happen one at a time.
 */
@Injectable()
export class OrderKitchenService {
    private readonly logger = new Logger(OrderKitchenService.name);

    constructor(
        // Optional for specs that exercise only the kitchen. Without it an
        // edit still stands, and says the money could not be moved.
        @Optional() private readonly payments?: PaymentsService,
    ) {}

    /** The order as Order Detail renders it. `order:read` or `order:stage`. */
    async read(
        ctx: OrganizationContext,
        orderId: string,
    ): Promise<OrderReadDto> {
        if (!allows(ctx, "order:read") && !allows(ctx, "order:stage")) {
            // The same refusal authorize() gives, naming the narrower action.
            authorize(ctx, "order:stage");
        }
        const order = await prisma.order.findFirst({
            where: { id: orderId, organizationId: ctx.organizationId },
            include: READ_INCLUDE,
        });
        if (!order) throw new NotFoundException("Order not found");

        const actorIds = [
            ...new Set(
                order.events
                    .map((e) => e.actorUserId)
                    .filter((id): id is string => Boolean(id)),
            ),
        ];
        const actors =
            actorIds.length > 0
                ? await prisma.user.findMany({
                      where: { id: { in: actorIds } },
                      select: { id: true, name: true },
                  })
                : [];
        const money = allows(ctx, "payment:read");
        return serializeOrderRead(order, {
            money,
            owedBack: money
                ? await owedBackOn(prisma, ctx.organizationId, order.id)
                : [],
            fullRead: allows(ctx, "order:read"),
            invoiceRead: allows(ctx, "invoice:read"),
            actors: new Map(actors.map((a) => [a.id, a.name])),
            now: new Date(),
        });
    }

    /**
     * Move the order to its next kitchen stage, and its status with it.
     * `order:stage`. Stock follows the status (a collected or dispatched
     * order commits what it held). Returns the step's event id — what an
     * Undo names.
     */
    async moveStage(
        ctx: OrganizationContext,
        orderId: string,
        dto: MoveStageDto,
    ): Promise<{ id: string; stage: string; status: string; eventId: string }> {
        authorize(ctx, "order:stage");
        return prisma.$transaction(async (tx) => {
            const order = await lockOrder(tx, ctx, orderId);
            const move = planStageMove(
                {
                    stage: order.stage,
                    status: order.status,
                    paymentStatus: order.paymentStatus,
                    fulfilment: order.fulfilment,
                },
                dto.to,
            );
            if (dto.trackingUrl && move.to !== "HANDED_TO_COURIER") {
                throw new BadRequestException({
                    message:
                        "A tracking link goes with handing the order to a courier.",
                    field: "trackingUrl",
                });
            }
            await applyInventoryTransition(
                tx,
                order.items,
                phaseOf(move.fromStatus),
                phaseOf(move.toStatus),
                ctx.userId,
            );
            await tx.order.update({
                where: { id: order.id },
                data: {
                    stage: move.to,
                    status: move.toStatus,
                    ...(dto.trackingUrl
                        ? { trackingUrl: dto.trackingUrl }
                        : {}),
                },
            });
            const event = await tx.orderEvent.create({
                data: {
                    organizationId: ctx.organizationId,
                    orderId: order.id,
                    kind: "STAGE",
                    actorUserId: ctx.userId,
                    fromStage: move.from,
                    toStage: move.to,
                    fromStatus: move.fromStatus,
                    toStatus: move.toStatus,
                    note: dto.note ?? null,
                },
                select: { id: true },
            });
            return {
                id: order.id,
                stage: move.to,
                status: move.toStatus,
                eventId: event.id,
            };
        });
    }

    /**
     * Undo the last kitchen step, named by its event. `order:stage`. Only the
     * latest step, only once, only within the window (order-stage.ts); its
     * stock moves are reversed on the rows the lines recorded, and the undo
     * is itself a step on the timeline.
     */
    async undoStage(
        ctx: OrganizationContext,
        orderId: string,
        eventId: string,
    ): Promise<{ id: string; stage: string; status: string; eventId: string }> {
        authorize(ctx, "order:stage");
        return prisma.$transaction(async (tx) => {
            const order = await lockOrder(tx, ctx, orderId);
            const event = await tx.orderEvent.findFirst({
                where: { id: eventId, orderId: order.id },
            });
            if (!event)
                throw new NotFoundException("That step is not on this order");
            const latest = await tx.orderEvent.findFirst({
                where: { orderId: order.id },
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                select: { id: true },
            });
            const now = new Date();
            const back = planUndo(
                {
                    stage: order.stage,
                    status: order.status,
                },
                {
                    ...event,
                    fromStage: event.fromStage,
                    toStage: event.toStage,
                },
                latest?.id ?? null,
                now,
            );
            await applyInventoryTransition(
                tx,
                order.items,
                phaseOf(order.status),
                phaseOf(back.status),
                ctx.userId,
            );
            await tx.order.update({
                where: { id: order.id },
                data: { stage: back.stage, status: back.status },
            });
            await tx.orderEvent.update({
                where: { id: event.id },
                data: { undoneAt: now },
            });
            const undo = await tx.orderEvent.create({
                data: {
                    organizationId: ctx.organizationId,
                    orderId: order.id,
                    kind: "UNDO",
                    actorUserId: ctx.userId,
                    fromStage: order.stage,
                    toStage: back.stage,
                    fromStatus: order.status,
                    toStatus: back.status,
                    undoesEventId: event.id,
                },
                select: { id: true },
            });
            return {
                id: order.id,
                stage: back.stage,
                status: back.status,
                eventId: undo.id,
            };
        });
    }

    /**
     * Change an order before anyone starts on it (ADR-008). `order:write`.
     *
     * Lines, fulfilment and address only while it is New; notes until it is
     * cancelled. Stock follows each line on the row it recorded. When the
     * total changes on an order that was paid, the difference is taken (a
     * payment on the order for exactly that amount) or handed back (a refund
     * marked as for the edit), which also needs `payment:manage`. An earlier
     * edit's charge still unpaid is superseded, so one charge at most is ever
     * open for the difference. An unpaid order just costs the new total.
     *
     * The order and its stock change in one transaction; the money moves
     * after it commits, because a provider call does not belong inside a row
     * lock. If handing money back fails, the edit stands and the read shows
     * what is owed — the response says so rather than pretending.
     */
    async edit(
        ctx: OrganizationContext,
        orderId: string,
        dto: EditOrderDto,
    ): Promise<{
        id: string;
        eventId: string | null;
        /** How much the total moved. */
        differenceCents: number;
        /** What was taken (+) or handed back (-) to settle it. */
        settleCents: number;
        charge: CreateIntentResult | null;
        refund: {
            refundId: string;
            amountCents: number;
            status: string;
        } | null;
        moneyError: string | null;
    }> {
        authorize(ctx, "order:write");
        const touchesItems =
            (dto.lines?.length ?? 0) > 0 || (dto.add?.length ?? 0) > 0;
        const touchesDelivery =
            dto.fulfilment !== undefined || dto.address !== undefined;
        const touchesNotes = dto.notes !== undefined;
        if (!touchesItems && !touchesDelivery && !touchesNotes) {
            throw new BadRequestException("Nothing to change");
        }
        // A repeated itemId would apply its delta twice against the same
        // stale snapshot below (and `[{a,0},{a,1}]` deletes, then updates,
        // a row that is already gone) — refused before any of that runs.
        const changedItemIds = new Set<string>();
        for (const change of dto.lines ?? []) {
            if (changedItemIds.has(change.itemId)) {
                throw new BadRequestException({
                    message: "Each item can be changed once per edit.",
                    field: "lines",
                });
            }
            changedItemIds.add(change.itemId);
        }

        // Priced before the lock: reading the catalogue needs no lock, and
        // an unknown product fails before anything is held.
        const added = dto.add?.length
            ? await priceOrderLinesFor(ctx, orderId, dto.add)
            : [];

        const result = await prisma.$transaction(async (tx) => {
            const order = await lockOrder(tx, ctx, orderId);
            if (order.status === "CANCELLED") {
                throw new ConflictException({
                    message: "This order was cancelled, so it cannot change.",
                    field: "status",
                });
            }
            if (
                (touchesItems || touchesDelivery) &&
                !canEditItems({
                    stage: order.stage,
                    status: order.status,
                    paymentStatus: order.paymentStatus,
                })
            ) {
                throw new ConflictException({
                    message:
                        "Items and the address can only change before the order starts preparing.",
                    field: "stage",
                });
            }
            const paid = order.paymentStatus === "PAID";
            if (touchesItems && paid && !allows(ctx, "payment:manage")) {
                // Changing what a paid order costs moves money.
                authorize(ctx, "payment:manage");
            }

            const changes: string[] = [];
            // What changed, line by line, for the invoice's correction
            // (ADR-008): the order's issued invoice is never edited.
            const corrections: {
                orderItemId: string | null;
                productId: string;
                description: string;
                deltaQuantity: number;
                unitCents: number;
            }[] = [];
            let subtotalCents = toCents(order.subtotal.toString());

            for (const change of dto.lines ?? []) {
                const item = order.items.find((i) => i.id === change.itemId);
                if (!item) {
                    throw new BadRequestException({
                        message: "That line is not on this order.",
                        field: "lines",
                    });
                }
                if (item.refundLines.length > 0) {
                    throw new ConflictException({
                        message: "A line that was refunded cannot be changed.",
                        field: "lines",
                    });
                }
                const delta = change.quantity - item.quantity;
                if (delta === 0) continue;
                const unit = toCents(item.price.toString());
                subtotalCents += delta * unit;
                corrections.push({
                    // A removed line is deleted below; its credit names none.
                    orderItemId: change.quantity === 0 ? null : item.id,
                    productId: item.productId,
                    description: item.product.name,
                    deltaQuantity: delta,
                    unitCents: unit,
                });
                if (change.quantity === 0) {
                    await applyInventoryTransition(
                        tx,
                        [item],
                        "RESERVED",
                        "RELEASED",
                    );
                    await tx.orderItem.delete({ where: { id: item.id } });
                    changes.push(`removed ${item.product.name}`);
                } else {
                    await adjustReservation(tx, item, delta);
                    await tx.orderItem.update({
                        where: { id: item.id },
                        data: { quantity: change.quantity },
                    });
                    changes.push(
                        `${item.product.name} ${item.quantity} → ${change.quantity}`,
                    );
                }
            }

            if (added.length > 0) {
                const created = [];
                for (const line of added) {
                    const item = await tx.orderItem.create({
                        data: {
                            orderId: order.id,
                            productId: line.productId,
                            variantId: line.variantId,
                            quantity: line.quantity,
                            price: fromCents(line.priceCents),
                        },
                        select: {
                            id: true,
                            productId: true,
                            variantId: true,
                            quantity: true,
                            product: { select: { name: true } },
                        },
                    });
                    created.push(item);
                    corrections.push({
                        orderItemId: item.id,
                        productId: line.productId,
                        description: item.product.name,
                        deltaQuantity: line.quantity,
                        unitCents: line.priceCents,
                    });
                    subtotalCents += line.priceCents * line.quantity;
                }
                await applyInventoryTransition(
                    tx,
                    created,
                    "RELEASED",
                    "RESERVED",
                );
                changes.push(
                    `added ${added.length} line${added.length === 1 ? "" : "s"}`,
                );
            }

            const remaining = await tx.orderItem.count({
                where: { orderId: order.id },
            });
            if (remaining === 0) {
                throw new BadRequestException({
                    message:
                        "An order needs at least one item. Cancel it instead.",
                    field: "lines",
                });
            }

            const oldTotalCents = toCents(order.total.toString());
            // A GST-registered business's prices include GST: its `tax` is
            // the GST inside the total, worked out again, never added
            // (ADR-008). Anyone else's add-on tax stays what it was.
            const profile = await loadTaxProfile(tx, ctx.organizationId);
            // The discount stays what it was when the order was placed, and
            // never takes the total below zero. (A percentage code is not
            // re-rated on an edit; the merchant sees the new total first.)
            const totalCents = Math.max(
                0,
                subtotalCents +
                    (profile.registered ? 0 : toCents(order.tax.toString())) +
                    toCents(order.shipping.toString()) -
                    toCents(order.discount.toString()),
            );

            const fulfilment = dto.fulfilment ?? order.fulfilment;
            const address =
                dto.address === null
                    ? CLEARED_ADDRESS
                    : dto.address
                      ? {
                            deliveryName: dto.address.name ?? null,
                            deliveryPhone: dto.address.phone ?? null,
                            deliveryLine1: dto.address.line1,
                            deliveryLine2: dto.address.line2 ?? null,
                            deliveryCity: dto.address.city,
                            deliveryState: dto.address.state,
                            deliveryPostalCode: dto.address.postalCode,
                        }
                      : {};
            const hasAddress =
                dto.address === null
                    ? false
                    : dto.address
                      ? true
                      : Boolean(order.deliveryLine1);
            if (fulfilment === "DELIVERY" && !hasAddress) {
                throw new BadRequestException({
                    message: "A delivery needs an address.",
                    field: "address",
                });
            }
            if (dto.fulfilment && dto.fulfilment !== order.fulfilment) {
                changes.push(
                    dto.fulfilment === "DELIVERY"
                        ? "now a delivery"
                        : "now collected",
                );
            }
            if (dto.address !== undefined) changes.push("address changed");
            if (touchesNotes) changes.push("notes changed");

            let gstCents: number | null = null;
            if (profile.registered && (touchesItems || touchesDelivery)) {
                const items = await tx.orderItem.findMany({
                    where: { orderId: order.id },
                    select: { productId: true, quantity: true, price: true },
                });
                const address =
                    dto.address === null
                        ? null
                        : (dto.address?.state ?? order.deliveryState);
                gstCents = gstInsideOrder(
                    await withGstRates(
                        items.map((i) => ({
                            productId: i.productId,
                            quantity: i.quantity,
                            priceCents: toCents(i.price.toString()),
                        })),
                    ),
                    {
                        shippingCents: toCents(order.shipping.toString()),
                        discountCents: toCents(order.discount.toString()),
                        deliveryState:
                            (dto.fulfilment ?? order.fulfilment) === "DELIVERY"
                                ? address
                                : null,
                        profile,
                    },
                );
            }

            await tx.order.update({
                where: { id: order.id },
                data: {
                    ...(touchesItems
                        ? {
                              subtotal: fromCents(subtotalCents),
                              total: fromCents(totalCents),
                          }
                        : {}),
                    ...(gstCents !== null ? { tax: fromCents(gstCents) } : {}),
                    ...(dto.fulfilment ? { fulfilment: dto.fulfilment } : {}),
                    ...address,
                    ...(touchesNotes ? { notes: dto.notes ?? null } : {}),
                },
            });

            const differenceCents = touchesItems
                ? totalCents - oldTotalCents
                : 0;
            // What to take or hand back comes from the ledger, not from the
            // difference alone: an earlier edit's charge may never have been
            // paid. Positive: still to take; negative: paid for more than the
            // order now costs. Line refunds cancel out (they lowered what
            // was paid for, not the total), so only edit refunds count.
            let settleCents = 0;
            if (touchesItems && paid) {
                // An earlier edit's charge still open asks for a difference
                // this edit replaces: superseded first, so only the charge
                // made below (if any) is left to pay.
                await supersedeOpenDifferenceIntents(
                    tx,
                    ctx.organizationId,
                    order.id,
                );
                const ledger = await tx.paymentIntent.findMany({
                    where: {
                        orderId: order.id,
                        organizationId: ctx.organizationId,
                        status: "SUCCEEDED",
                    },
                    select: {
                        amountCents: true,
                        refunds: {
                            where: { status: { not: "FAILED" }, forEdit: true },
                            select: { amountCents: true },
                        },
                    },
                });
                const kept = ledger.reduce(
                    (s, p) =>
                        s +
                        p.amountCents -
                        p.refunds.reduce((r, x) => r + x.amountCents, 0),
                    0,
                );
                settleCents = totalCents - kept;
                // What was paid covers the order now: a supplementary
                // invoice an earlier edit left waiting on the charge just
                // superseded is settled by that money, as one written now
                // would be (its units' credit note, below, offsets it). Left
                // ISSUED, it would read as a bill nobody is asked to pay.
                if (settleCents <= 0) {
                    await settleSupplementaryInvoices(tx, order.id);
                }
            }
            const event = await tx.orderEvent.create({
                data: {
                    organizationId: ctx.organizationId,
                    orderId: order.id,
                    kind: "EDIT",
                    actorUserId: ctx.userId,
                    fromStage: order.stage,
                    toStage: order.stage,
                    note: changes.length > 0 ? changes.join("; ") : null,
                    amountCents: differenceCents || null,
                },
                select: { id: true },
            });
            // An issued order invoice is never edited (ADR-008): added units
            // make a supplementary invoice, removed ones a credit note, both
            // referencing it. Nothing when the order has no invoice yet —
            // an unpaid order's invoice, when it comes, is the edited order.
            if (touchesItems && corrections.length > 0) {
                await correctOrderInvoiceForEdit(tx, {
                    orderId: order.id,
                    changes: corrections,
                    note: changes.length > 0 ? changes.join("; ") : null,
                    createdByUserId: ctx.userId,
                    // Still to be taken on the order: settled when it is.
                    settled: settleCents <= 0,
                });
            }
            return {
                id: order.id,
                eventId: event.id,
                differenceCents,
                settleCents,
            };
        });

        let charge: CreateIntentResult | null = null;
        let refund: {
            refundId: string;
            amountCents: number;
            status: string;
        } | null = null;
        let moneyError: string | null = null;
        if (result.settleCents !== 0) {
            const key = `${DIFFERENCE_KEY_PREFIX}${result.eventId}`;
            try {
                if (!this.payments) {
                    throw new Error("Payments are not available");
                }
                if (result.settleCents > 0) {
                    charge = await this.payments.createDifferenceIntent(
                        ctx,
                        result.id,
                        result.settleCents,
                        key,
                    );
                } else {
                    const r = await this.payments.refundOrderDifference(
                        ctx,
                        result.id,
                        -result.settleCents,
                        key,
                    );
                    refund = {
                        refundId: r.refundId,
                        amountCents: r.amountCents,
                        status: r.status,
                    };
                }
            } catch (err) {
                // The edit stands; the read shows what is due or owed back.
                moneyError =
                    err instanceof Error ? err.message : "The payment failed";
                this.logger.warn(
                    `Order ${result.id} edited; moving the difference failed: ${moneyError}`,
                );
            }
        }
        return {
            id: result.id,
            eventId: result.eventId,
            differenceCents: result.differenceCents,
            settleCents: result.settleCents,
            charge,
            refund,
            moneyError,
        };
    }
}

const CLEARED_ADDRESS = {
    deliveryName: null,
    deliveryPhone: null,
    deliveryLine1: null,
    deliveryLine2: null,
    deliveryCity: null,
    deliveryState: null,
    deliveryPostalCode: null,
} as const;

/** What Order Detail reads — see order-read.ts. */
const READ_INCLUDE = {
    store: { select: { id: true, name: true } },
    customer: {
        select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
            // The contact it is confirmed as — the oldest link, so the
            // answer does not move when a second is made.
            identityLinks: {
                orderBy: { createdAt: "asc" },
                take: 1,
                select: { contactId: true },
            },
            orders: {
                orderBy: { createdAt: "asc" },
                take: 1,
                select: { createdAt: true },
            },
            _count: { select: { orders: true } },
        },
    },
    items: {
        orderBy: { id: "asc" },
        include: {
            product: {
                select: {
                    name: true,
                    image: true,
                    allergens: {
                        orderBy: { allergen: { position: "asc" } },
                        select: {
                            kind: true,
                            allergen: { select: { id: true, name: true } },
                        },
                    },
                },
            },
            variant: {
                select: {
                    title: true,
                    sku: true,
                    image: true,
                    photo: { select: { url: true } },
                },
            },
            refundLines: {
                where: { paymentRefund: { status: { not: "FAILED" } } },
                select: {
                    quantity: true,
                    amountCents: true,
                    putBackQuantity: true,
                },
            },
        },
    },
    events: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
    // The order's invoice and its corrections (ADR-008).
    invoices: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, number: true, kind: true, status: true },
    },
    paymentIntents: {
        where: { status: "SUCCEEDED" },
        select: {
            amountCents: true,
            refunds: {
                where: { status: { not: "FAILED" } },
                orderBy: { createdAt: "asc" },
                select: {
                    id: true,
                    amountCents: true,
                    forEdit: true,
                    status: true,
                    providerRefundId: true,
                },
            },
        },
    },
    discountRedemption: {
        select: {
            code: true,
            kind: true,
            percentBps: true,
            ruleAmount: true,
            currency: true,
        },
    },
} satisfies Prisma.OrderInclude;

/**
 * Take the order's row lock and load what every kitchen write needs. Scoped
 * to the caller's organization: another business's order is a 404.
 */
async function lockOrder(
    tx: Prisma.TransactionClient,
    ctx: OrganizationContext,
    orderId: string,
) {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} AND "organizationId" = ${ctx.organizationId} FOR UPDATE`;
    const order = await tx.order.findFirst({
        where: { id: orderId, organizationId: ctx.organizationId },
        include: {
            items: {
                orderBy: { id: "asc" },
                include: {
                    product: { select: { name: true } },
                    refundLines: {
                        where: {
                            paymentRefund: { status: { not: "FAILED" } },
                        },
                        select: { id: true },
                    },
                },
            },
        },
    });
    if (!order) throw new NotFoundException("Order not found");
    return order;
}

/** Price lines to add, against the order's own storefront. */
async function priceOrderLinesFor(
    ctx: OrganizationContext,
    orderId: string,
    items: NonNullable<EditOrderDto["add"]>,
) {
    const order = await prisma.order.findFirst({
        where: { id: orderId, organizationId: ctx.organizationId },
        select: { storeId: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    return priceOrderLines(order.storeId, items);
}
