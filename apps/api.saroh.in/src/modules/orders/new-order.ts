import { BadRequestException, ConflictException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { fromMinor, toMinor } from "../../common/money";
import { isReservedContactEmail } from "../contacts/contact-email";
import { normalisePhone } from "../customer-workspace/duplicates";
import { resolveContact } from "../customer-workspace/resolve-contact";
import { ensureOrderInvoice } from "../invoices/order-invoicing";
import { feeCents } from "./checkout-quote";
import type { CreateOrderDto } from "./dto";
import type { FulfilmentType, StorefrontFulfilmentType } from "./fulfilment";
import {
    allowedTypes,
    FULFILMENT_RULES,
    NEW_STOREFRONT_TYPES,
    storefrontTypesOf,
} from "./fulfilment";
import type { CounterPayment } from "./new-order.dto";
import { COUNTER_PAYMENTS } from "./new-order.dto";
import { RETIRED_PAY_LINK } from "./order-pay-link";
import {
    contactByPhone,
    lockWalkInPhone,
    storeCustomerByPhone,
    walkInCustomerInTx,
    walkInPhoneKey,
} from "./walk-in-customer";

/**
 * New order v2 (plan B, B13): who an order taken by hand is for, how it is
 * paid, and the ways it may leave. `orders.service.ts` calls these inside
 * the order's own transaction, so a refusal here makes no order.
 */

type Tx = Prisma.TransactionClient;

/** Who the order is for, as the order stores it. */
export interface OrderParty {
    customerId: string | null;
    walkInName: string | null;
    walkInPhone: string | null;
}

/** The ways of naming who it is for; exactly one is sent. */
type PartyFields = Pick<
    CreateOrderDto,
    "customerId" | "contactId" | "customer" | "walkIn"
>;

/**
 * Exactly one of a storefront customer, a picked person, someone new or a
 * walk-in. None, or two at once, is a 400: the order would not say who it
 * is for, or would say it twice.
 */
export function assertOneParty(dto: PartyFields): void {
    const given = [
        dto.customerId,
        dto.contactId,
        dto.customer,
        dto.walkIn,
    ].filter((v) => v !== undefined && v !== "").length;
    if (given === 1) return;
    throw new BadRequestException({
        message:
            given === 0
                ? "Say who the order is for: a customer, or a walk-in's name."
                : "An order is for one person: a customer or a walk-in, not both.",
        details: { field: "customer" },
    });
}

/**
 * Who the order is for, found or made inside the order's transaction:
 *
 * - a storefront customer id: that customer, at this storefront;
 * - a picked person (a contact): the storefront customer already linked to
 *   them here, else the one with their email, else a new one; linked to
 *   them when it has no link yet, since staff chose who it is;
 * - someone new, by email: the storefront customer with that email, else a
 *   new one. A contact is linked once it is paid (C2's
 *   `ensureContactForPaidOrder`), never made here;
 * - a walk-in with only a name: no customer and no contact, the name on
 *   the order;
 * - a walk-in with a phone (B13b): a customer, as a picked person is. The
 *   business's contact with that phone when there is one (never one
 *   removed for privacy); else the storefront's customer with it, else a
 *   new one, given a contact of its own (`walk-in-customer.ts`). The phone
 *   goes on the customer, never on the order.
 *
 * Emails are matched whatever their case, oldest customer first, so no
 * second customer is ever made for an email the storefront already has.
 */
export async function orderPartyInTx(
    tx: Tx,
    input: {
        storeId: string;
        organizationId: string | null;
        userId: string;
        dto: PartyFields;
    },
): Promise<OrderParty> {
    const { storeId, organizationId, userId, dto } = input;
    assertOneParty(dto);
    if (dto.walkIn) {
        const name = dto.walkIn.name.trim();
        if (!name) {
            throw new BadRequestException({
                message: "Add the walk-in's name.",
                details: { field: "walkIn.name" },
            });
        }
        const phone = blankToNull(dto.walkIn.phone);
        if (!phone) {
            return { customerId: null, walkInName: name, walkInPhone: null };
        }
        return {
            customerId: await walkInWithPhone(tx, {
                storeId,
                organizationId,
                userId,
                name,
                phone,
            }),
            walkInName: null,
            walkInPhone: null,
        };
    }
    const party = (customerId: string): OrderParty => ({
        customerId,
        walkInName: null,
        walkInPhone: null,
    });
    if (dto.customerId) {
        const customer = await tx.customer.findFirst({
            where: { id: dto.customerId, storeId },
            select: { id: true },
        });
        if (!customer) {
            throw new BadRequestException({
                message: "Unknown customer",
                details: { field: "customerId" },
            });
        }
        return party(customer.id);
    }
    if (dto.customer) {
        const { email, name, phone } = dto.customer;
        return party(
            await storeCustomerByEmail(tx, {
                storeId,
                organizationId,
                email,
                name: name ?? null,
                phone: phone ?? null,
            }),
        );
    }
    if (!organizationId || !dto.contactId) {
        throw new BadRequestException({
            message: "Unknown customer",
            details: { field: "contactId" },
        });
    }
    return party(
        await storeCustomerForContact(tx, {
            storeId,
            organizationId,
            userId,
            contactId: dto.contactId,
        }),
    );
}

/**
 * A walk-in who gave their phone (B13b): the contact with it, as if picked,
 * else the storefront's customer by it (`walk-in-customer.ts`). One phone at
 * a time, so two orders for a new number make one customer.
 */
async function walkInWithPhone(
    tx: Tx,
    input: {
        storeId: string;
        organizationId: string | null;
        userId: string;
        name: string;
        phone: string;
    },
): Promise<string> {
    const { storeId, organizationId, userId } = input;
    const key = walkInPhoneKey(input.phone);
    await lockWalkInPhone(tx, organizationId ?? storeId, key);
    const contactId = organizationId
        ? await contactByPhone(tx, organizationId, key)
        : null;
    if (organizationId && contactId) {
        return storeCustomerForContact(tx, {
            storeId,
            organizationId,
            userId,
            contactId,
        });
    }
    return walkInCustomerInTx(tx, { ...input, key });
}

async function storeCustomerForContact(
    tx: Tx,
    input: {
        storeId: string;
        organizationId: string;
        userId: string;
        contactId: string;
    },
): Promise<string> {
    const { storeId, organizationId, userId } = input;
    // A person merged away since the search lands on who they became (C9).
    const resolved = await resolveContact(tx, input.contactId, organizationId);
    if (!resolved) {
        throw new BadRequestException({
            message: "That customer isn't in this business any more.",
            details: { field: "contactId" },
        });
    }
    if (resolved.removed) {
        throw new ConflictException({
            message:
                "That customer's details were removed. Take it as a walk-in.",
            details: { field: "contactId" },
        });
    }
    const linked = await tx.customerIdentityLink.findFirst({
        where: { contactId: resolved.id, customer: { storeId } },
        orderBy: { createdAt: "asc" },
        select: { customerId: true },
    });
    if (linked) return linked.customerId;

    const contact = await tx.contact.findFirst({
        where: { id: resolved.id, organizationId },
        select: { email: true, firstName: true, lastName: true, phone: true },
    });
    const email = contact?.email.trim().toLowerCase() ?? "";
    const name = contact
        ? [contact.firstName, contact.lastName].filter(Boolean).join(" ")
        : "";
    // Known by their phone alone (a walk-in kept as a customer, B13b): the
    // storefront's customer is found or made by that phone instead.
    const phoneKey = normalisePhone(contact?.phone);
    const byPhone =
        contact?.phone && phoneKey && (!email || isReservedContactEmail(email))
            ? await storeCustomerByPhone(tx, {
                  storeId,
                  organizationId,
                  key: phoneKey,
                  name,
                  phone: contact.phone,
              })
            : null;
    if (byPhone) {
        await linkIfUnlinked(tx, {
            organizationId,
            contactId: resolved.id,
            customerId: byPhone.id,
            userId,
        });
        return byPhone.id;
    }
    if (!contact || !email || isReservedContactEmail(email)) {
        throw new ConflictException({
            message:
                "They have no email yet, which an order's customer needs. Add one on their page, or take it as a walk-in.",
            details: { field: "contactId" },
        });
    }
    const customerId = await storeCustomerByEmail(tx, {
        storeId,
        organizationId,
        email,
        name,
        phone: contact.phone,
    });
    await linkIfUnlinked(tx, {
        organizationId,
        contactId: resolved.id,
        customerId,
        userId,
    });
    return customerId;
}

/**
 * Staff picked who it is: the storefront customer is theirs, unless it is
 * already someone's (a link is never moved on an email or a phone alone).
 */
async function linkIfUnlinked(
    tx: Tx,
    input: {
        organizationId: string;
        contactId: string;
        customerId: string;
        userId: string;
    },
): Promise<void> {
    const links = await tx.customerIdentityLink.count({
        where: { customerId: input.customerId },
    });
    if (links > 0) return;
    await tx.customerIdentityLink.create({
        data: {
            organizationId: input.organizationId,
            contactId: input.contactId,
            customerId: input.customerId,
            reason: "MANUAL",
            linkedByUserId: input.userId,
        },
        select: { id: true },
    });
}

async function storeCustomerByEmail(
    tx: Tx,
    input: {
        storeId: string;
        organizationId: string | null;
        email: string;
        name: string | null;
        phone: string | null;
    },
): Promise<string> {
    const { storeId, organizationId, email } = input;
    const found = await tx.customer.findFirst({
        where: { storeId, email: { equals: email, mode: "insensitive" } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true },
    });
    if (found) return found.id;
    const words = (input.name ?? "").trim().split(/\s+/).filter(Boolean);
    const made = await tx.customer.create({
        data: {
            storeId,
            organizationId,
            email,
            firstName: words[0] ?? null,
            lastName: words.length > 1 ? words.slice(1).join(" ") : null,
            phone: input.phone,
        },
        select: { id: true },
    });
    return made.id;
}

function blankToNull(value: string | null | undefined): string | null {
    const text = value?.trim();
    return text !== undefined && text.length > 0 ? text : null;
}

/** How a payment taken at the counter reads on the order's timeline. */
export const COUNTER_NOTE: Record<CounterPayment, string> = {
    CASH: "Paid in cash",
    UPI: "Paid by UPI at the counter",
    CARD: "Paid by card at the counter",
};

export function isCounterPayment(kind: string): kind is CounterPayment {
    return (COUNTER_PAYMENTS as readonly string[]).includes(kind);
}

/**
 * What cash was handed over, in minor units, checked against the total: a
 * cash payment short of it is refused, since the order would read paid
 * with money missing. Absent, the exact total was given.
 */
export function cashReceivedCents(
    received: string | undefined,
    totalCents: number,
    format: (cents: number) => string,
): number {
    if (received === undefined) return totalCents;
    const cents = toMinor(received);
    if (cents < totalCents) {
        throw new BadRequestException({
            message: `That's ${format(totalCents - cents)} short.`,
            details: { field: "received" },
        });
    }
    return cents;
}

/**
 * Paid at the counter, now: cash, UPI or a card machine. Nothing is
 * charged through a provider. The order reads paid, its invoice is written
 * as a payment recorded by hand is (DEC-023), and its timeline says how.
 * The note carries no amount, since whoever works the order reads the
 * timeline without money; what was handed over is the step's amount, which
 * only a money reader sees. Any pay link it had stops working (B11,
 * DEC-067), so nobody can pay twice.
 */
export async function takeCounterPaymentInTx(
    tx: Tx,
    input: {
        orderId: string;
        organizationId: string | null;
        userId: string;
        kind: CounterPayment;
        receivedCents: number | null;
        at: Date;
    },
): Promise<void> {
    const { orderId, organizationId, userId, kind, at } = input;
    await tx.order.update({
        where: { id: orderId },
        data: { paymentStatus: "PAID", paidAt: at, ...RETIRED_PAY_LINK },
    });
    await ensureOrderInvoice(tx, orderId, { at, method: kind });
    if (!organizationId) return;
    await tx.orderEvent.create({
        data: {
            organizationId,
            orderId,
            kind: "STATUS",
            actorUserId: userId,
            fromStatus: null,
            toStatus: null,
            note: COUNTER_NOTE[kind],
            amountCents: input.receivedCents,
        },
    });
}

/** A way an order can leave, as New order offers it. */
export interface NewOrderWay {
    type: StorefrontFulfilmentType | "DIGITAL";
    label: string;
    /** "60.00", or null when it adds nothing. */
    fee: string | null;
}

/** What New order reads beside its lines. */
export interface NewOrderLinesRead {
    /** The ways every line allows and the storefront offers (B12). */
    ways: NewOrderWay[];
    /** Each line's allergens, for the allergy clash (by id, as ADR-008). */
    allergens: Record<
        string,
        {
            contains: { id: string; name: string }[];
            mayContain: { id: string; name: string }[];
        }
    >;
}

/**
 * The ways an order of these products can leave this storefront, with
 * what each adds, and each product's allergens (B13). With no products
 * yet, the storefront's own ways. The app draws these and keeps no copy
 * of the rule. Products not listed here are left out, as the create would
 * refuse them.
 */
export async function newOrderLines(
    storeId: string,
    productIds: readonly string[],
): Promise<NewOrderLinesRead> {
    const [settings, products] = await Promise.all([
        prisma.storeSettings.findUnique({
            where: { storeId },
            select: {
                fulfilmentTypes: true,
                collectionEnabled: true,
                shippingEnabled: true,
                localDeliveryFee: true,
                shippingFee: true,
            },
        }),
        productIds.length
            ? prisma.product.findMany({
                  where: {
                      id: { in: [...new Set(productIds)] },
                      listings: { some: { storeId } },
                  },
                  select: {
                      id: true,
                      name: true,
                      fulfilmentTypes: true,
                      allergens: {
                          orderBy: { allergen: { position: "asc" } },
                          select: {
                              kind: true,
                              allergen: { select: { id: true, name: true } },
                          },
                      },
                  },
              })
            : Promise.resolve([]),
    ]);
    const offered = storefrontOffers(settings);
    const types = products.length ? allowedTypes(products, offered) : offered;
    const fees = {
        localDeliveryFee: settings?.localDeliveryFee ?? null,
        shippingFee: settings?.shippingFee ?? null,
    };
    return {
        ways: types.map((type) => {
            const cents = type === "DIGITAL" ? 0 : feeCents(type, fees);
            return {
                type,
                label: FULFILMENT_RULES[type].label,
                fee: cents > 0 ? fromMinor(cents) : null,
            };
        }),
        allergens: Object.fromEntries(
            products.map((p) => [
                p.id,
                {
                    contains: p.allergens
                        .filter((a) => a.kind === "CONTAINS")
                        .map((a) => a.allergen),
                    mayContain: p.allergens
                        .filter((a) => a.kind === "MAY_CONTAIN")
                        .map((a) => a.allergen),
                },
            ]),
        ),
    };
}

/** The ways a storefront offers, as B9's change sheet reads them. */
export function storefrontOffers(
    settings: {
        fulfilmentTypes: readonly string[];
        collectionEnabled: boolean;
        shippingEnabled: boolean;
    } | null,
): StorefrontFulfilmentType[] {
    return settings
        ? storefrontTypesOf(settings.fulfilmentTypes, settings)
        : NEW_STOREFRONT_TYPES;
}

/**
 * Refuses a way the storefront doesn't offer (B13), after B12's per-item
 * check: a 409 naming what it does offer. Digital follows the product, not
 * the storefront, and is left to B12's check.
 */
export function assertStorefrontOffers(
    type: FulfilmentType,
    offered: readonly StorefrontFulfilmentType[],
): void {
    if (type === "DIGITAL") return;
    if ((offered as readonly string[]).includes(type)) return;
    const words = offered.map((t) => FULFILMENT_RULES[t].label);
    throw new ConflictException({
        message: words.length
            ? `This location doesn't offer ${FULFILMENT_RULES[type].label}. It offers ${words.join(", ")}.`
            : "This location doesn't offer a way for orders to leave yet. Turn one on in its settings.",
        details: { field: "fulfilment" },
    });
}
