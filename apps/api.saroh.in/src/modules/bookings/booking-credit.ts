import { BadRequestException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { DateTime } from "luxon";

import { classPacksOn } from "../class-packs/class-packs-on";
import { CREDIT_GONE, redeemPackInTx } from "../class-packs/redeem-pack";
import { resolveContact } from "../customer-workspace/resolve-contact";
import {
    ALLOWANCE_SELECT,
    classesAllowance,
} from "../subscriptions/classes-allowance";
import type { CreditChoice } from "./reservation";
import { classesUsedInMonth, useMembershipInTx } from "./use-membership";

/*
 * Paying for a class with a credit online (round-2 A10, R11): a signed-in
 * customer's pack or membership pays for the class, the way the desk spends
 * one (`bookByHand`). The API decides what is on offer — the page asks
 * (`offeredCredit`) and sends back only what it was given, and the booking
 * checks it all again under the pack's or the membership's row lock
 * (`spendCreditInTx`, on the reservation's transaction).
 */

type Db = Pick<
    Prisma.TransactionClient,
    | "$queryRaw"
    | "booking"
    | "customerSubscription"
    | "organizationModule"
    | "packPurchase"
>;

/** The one credit the pay step offers: "Use 1 credit (4 left)". */
export type PublicCredit =
    | {
          kind: "PACK";
          /** The purchase to name when booking with it. */
          id: string;
          /** The pack's name: "10 classes". */
          name: string;
          left: number;
          /** The last day it can be used, in the service's zone. */
          useBy: string;
      }
    | {
          kind: "MEMBERSHIP";
          /** The subscription to name when booking with it. */
          id: string;
          /** The plan's name: "Monthly unlimited". */
          name: string;
          /** Left in the class's month, of `allowance`. */
          left: number;
          allowance: number;
          /** When that month's classes start again, in its own zone. */
          resetsOn: string;
      };

/** What the credit read and the booking know of the service. */
export interface CreditService {
    id: string;
    capacity: number;
    timezone: string;
    /** More than one: a treatment, sold as one order and never on a credit. */
    visits: number;
}

/**
 * A treatment (more than one visit) is sold as one order and paid on it
 * (E9, DEC-050) — never with a pack or a membership, online as at the desk.
 */
function isTreatmentService(service: { visits?: number }): boolean {
    return (service.visits ?? 1) > 1;
}

/**
 * A class, as the booking page calls one (`capacity > 1`). Only a class is
 * paid with a membership's classes; a pack pays whatever it covers.
 */
export function isClassService(service: { capacity: number }): boolean {
    return service.capacity > 1;
}

/**
 * The credit a signed-in customer could pay this class with, or null.
 * A membership with a class left in the class's month comes first (the
 * Pulse Fitness design: members book "Included"), then the pack that runs
 * out soonest — the one the desk would spend — that covers the service,
 * has a class left and is still valid when the class starts. A membership
 * with no classes a month is not a class plan and is never offered; packs
 * are not offered while the business has Class packs off.
 */
export async function offeredCredit(
    db: Db,
    input: {
        organizationId: string;
        contactId: string;
        service: CreditService;
        startAt: Date;
    },
): Promise<PublicCredit | null> {
    const contact = await resolveContact(
        db,
        input.contactId,
        input.organizationId,
    );
    if (!contact || contact.removed) return null;
    // A treatment is paid on its order, never with a credit (DEC-050).
    if (isTreatmentService(input.service)) return null;
    const who = { organizationId: input.organizationId, contactId: contact.id };

    if (isClassService(input.service)) {
        const membership = await membershipCredit(db, who, input.startAt);
        if (membership) return membership;
    }
    if (!(await classPacksOn(db, input.organizationId))) return null;
    return packCredit(db, who, input.service, input.startAt);
}

async function membershipCredit(
    db: Db,
    who: { organizationId: string; contactId: string },
    startAt: Date,
): Promise<PublicCredit | null> {
    const subs = await db.customerSubscription.findMany({
        where: { ...who, status: "ACTIVE" },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
            id: true,
            timezone: true,
            ...ALLOWANCE_SELECT,
            plan: { select: { name: true, classesPerMonth: true } },
        },
    });
    for (const sub of subs) {
        const allowance = classesAllowance(sub);
        if (allowance === null || allowance <= 0) continue;
        const used = await classesUsedInMonth(db, sub, startAt);
        if (used >= allowance) continue;
        return {
            kind: "MEMBERSHIP",
            id: sub.id,
            name: sub.plan.name,
            left: allowance - used,
            allowance,
            resetsOn:
                DateTime.fromJSDate(startAt, { zone: sub.timezone })
                    .startOf("month")
                    .plus({ months: 1 })
                    .toISODate() ?? "",
        };
    }
    return null;
}

async function packCredit(
    db: Db,
    who: { organizationId: string; contactId: string },
    service: CreditService,
    startAt: Date,
): Promise<PublicCredit | null> {
    const purchases = await db.packPurchase.findMany({
        where: {
            ...who,
            expiresAt: { gt: startAt },
            pack: { services: { some: { serviceId: service.id } } },
        },
        // The desk's order (`redeemPackInTx`): the soonest to run out.
        orderBy: [{ expiresAt: "asc" }, { createdAt: "asc" }],
        select: {
            id: true,
            credits: true,
            expiresAt: true,
            pack: { select: { name: true } },
            _count: {
                select: { redemptions: { where: { reversedAt: null } } },
            },
        },
    });
    for (const p of purchases) {
        const left = p.credits - p._count.redemptions;
        if (left <= 0) continue;
        return {
            kind: "PACK",
            id: p.id,
            name: p.pack.name,
            left,
            useBy:
                DateTime.fromJSDate(p.expiresAt, {
                    zone: service.timezone,
                }).toISODate() ?? "",
        };
    }
    return null;
}

function refuse(message: string): never {
    throw new BadRequestException({
        message,
        details: { field: "pay", reason: CREDIT_GONE },
    });
}

/**
 * What a CREDIT booking names, checked before anything is held: exactly one
 * of a pack or a membership, and a membership only for a class.
 */
export function creditChoiceOf(
    given: { packPurchaseId?: string; subscriptionId?: string },
    service: { capacity: number; visits?: number },
): CreditChoice {
    // As the desk refuses it (`bookByHand`): a treatment is sold as one
    // order, and a credit would book visit 1 with no order behind it.
    if (isTreatmentService(service)) {
        refuse(
            "A treatment is paid for on its order, not with a pack or a membership.",
        );
    }
    const { packPurchaseId, subscriptionId } = given;
    if (packPurchaseId && subscriptionId) {
        refuse("A class is paid with one credit. Choose one.");
    }
    if (packPurchaseId) return { kind: "PACK", packPurchaseId };
    if (subscriptionId) {
        if (!isClassService(service)) {
            refuse("A membership pays for classes only.");
        }
        return { kind: "MEMBERSHIP", subscriptionId };
    }
    return refuse("Choose the credit this class comes out of.");
}

/**
 * Spend the credit on the booking just written, on the reservation's
 * transaction — so a refusal takes the booking back with it — in the lock
 * order `backend-billing-and-classes.md` gives: the booking is written, then
 * the pack purchase (or the subscription) is locked and counted. The pack's
 * redemption and "Paid with" are the ones a booking made at the desk gets.
 */
export async function spendCreditInTx(
    tx: Prisma.TransactionClient,
    input: {
        organizationId: string;
        bookingId: string;
        contactId: string;
        serviceId: string;
        startAt: Date;
        credit: CreditChoice;
    },
): Promise<void> {
    if (input.credit.kind === "PACK") {
        await redeemPackInTx(tx, {
            organizationId: input.organizationId,
            bookingId: input.bookingId,
            contactId: input.contactId,
            serviceId: input.serviceId,
            startAt: input.startAt,
            purchaseId: input.credit.packPurchaseId,
            actor: "customer",
        });
        return;
    }
    await useMembershipInTx(tx, {
        organizationId: input.organizationId,
        bookingId: input.bookingId,
        contactId: input.contactId,
        subscriptionId: input.credit.subscriptionId,
        startAt: input.startAt,
        actor: "customer",
    });
}
