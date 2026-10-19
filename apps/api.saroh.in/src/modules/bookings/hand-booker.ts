import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";
import { normalisePhoneNumber } from "@saroh/block-contract";
import type { Contact } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { normalisePhone } from "../customer-workspace/duplicates";
import { contactByPhone } from "../orders/walk-in-customer";
import { mayTakeDeskPayment } from "./booking-access";
import type { DeskMethod } from "./desk-take";
import type { PaidWith } from "./dto";
import type { BookInput } from "./reservation";

/*
 * Who a booking made by hand is for, and the rules only a booking made by
 * hand has (DEC-170, owner 19 Oct): a caller who gives just a name and a
 * phone can be booked; "Paid now" says how it was paid; and a service the
 * team can't book is refused here while the booking page still offers it.
 */

/** No customer, no email and no phone: nobody to book. */
export const NO_BOOKER_MESSAGE =
    "Add their name and phone number, or choose one of your customers.";

/** A phone too short to keep anyone by. */
export const BOOKER_PHONE_MESSAGE = "That doesn't look like a phone number.";

/** Someone new by their phone still needs a name to be called by. */
export const BOOKER_NAME_MESSAGE = "Add their name.";

/** "Paid now" needs payment permission (DEC-098). */
export const CANT_TAKE_PAYMENT =
    "Your role can't take payment for bookings, because it can't issue invoices.";

/** How it was paid goes with "Paid now" only. */
export const PAID_BY_NEEDS_PAID =
    "Say how they paid only when they've paid now.";

/** What the team is told for a service only customers book (Q5). */
export function notBookableByTeamMessage(serviceName: string): string {
    return `Your team can't book ${serviceName}. Tick Your team under Who can book it on the service to book it here.`;
}

/**
 * The service must be one the team books (Q5): its "Your team" tick.
 * Undefined reads as ticked, as the column's default does.
 */
export function assertBookableByTeam(service: {
    name: string;
    bookableByTeam?: boolean | null;
}): void {
    if (service.bookableByTeam !== false) return;
    throw new ConflictException({
        message: notBookableByTeamMessage(service.name),
        details: { reason: "not-bookable-by-team" },
    });
}

/**
 * The phone as matched (digits only, India's 0091, 91 or trunk 0 dropped,
 * as orders' walk-ins and duplicate matching compare it), or a 400 naming
 * `bookerPhone`.
 */
export function bookerPhoneKey(phone: string): string {
    const key = normalisePhone(phone);
    if (!key) {
        throw new BadRequestException({
            message: BOOKER_PHONE_MESSAGE,
            field: "bookerPhone",
        });
    }
    return key;
}

/**
 * A typed phone as it is kept: E.164 by the one phone rule
 * (`@saroh/block-contract`, #1036), "098450 12345" as "+919845012345",
 * or a 400 naming `bookerPhone` with the rule's own words. Undefined for
 * nothing typed.
 */
export function bookerPhoneE164(phone: string | undefined): string | undefined {
    if (!phone?.trim()) return undefined;
    const result = normalisePhoneNumber(phone);
    if ("problem" in result) {
        throw new BadRequestException({
            message: result.problem,
            field: "bookerPhone",
        });
    }
    return result.phone ?? undefined;
}

/**
 * How it is paid, checked before anything is read: `paidBy` only with
 * "Paid now", and "Paid now" — with or without how — only for someone who
 * may take payment (`booking:write` and `invoice:write`, DEC-098). A
 * Member books and marks who came; the money is someone else's.
 */
export function assertHandPayment(
    ctx: OrganizationContext,
    dto: { paidWith?: PaidWith; paidBy?: DeskMethod },
): void {
    if (dto.paidBy && dto.paidWith !== "PAID") {
        throw new BadRequestException({
            message: PAID_BY_NEEDS_PAID,
            field: "paidBy",
        });
    }
    if (dto.paidWith === "PAID" && !mayTakeDeskPayment(ctx)) {
        throw new ForbiddenException(CANT_TAKE_PAYMENT);
    }
}

/** What a booking says of a contact, as they stand. */
function asTheyStand(
    startAt: string,
    contact: Pick<Contact, "email" | "firstName" | "lastName" | "phone">,
): BookInput {
    return {
        startAt,
        bookerEmail: contact.email,
        bookerName:
            [contact.firstName, contact.lastName]
                .filter(Boolean)
                .join(" ")
                .trim() || undefined,
        bookerPhone: contact.phone ?? undefined,
    };
}

/** A field left blank is not given, rather than "". */
function given(value: string | undefined): string | undefined {
    return value?.trim() ? value : undefined;
}

/**
 * Who the booking is for. In this order:
 *
 * 1. `contactId` — that customer, as they stand (a merged-away one's
 *    survivor, C9);
 * 2. `bookerEmail` — the customer with that email, as they stand (E4), or
 *    someone new with it, the name and phone given;
 * 3. `bookerPhone` and a name (DEC-170) — the customer with that phone,
 *    as they stand, or someone new kept by it: the reservation makes them
 *    under the phone's lock (`phone-booker.ts`), the way New order
 *    keeps a walk-in.
 *
 * Nothing given is a 400 naming `bookerPhone`. No refusal depends on who
 * exists.
 */
export async function handBooker(
    ctx: OrganizationContext,
    dto: {
        startAt: string;
        contactId?: string;
        bookerName?: string;
        bookerEmail?: string;
        bookerPhone?: string;
    },
): Promise<BookInput> {
    if (dto.contactId) {
        let contact = await prisma.contact.findUnique({
            where: { id: dto.contactId },
        });
        // A page loaded before a merge can still name the merged-away
        // contact (C9): book the survivor it points at. The booking is
        // then made by the survivor's email, never the tombstone's
        // placeholder.
        if (
            contact?.mergedIntoId &&
            contact.organizationId === ctx.organizationId
        ) {
            contact = await prisma.contact.findUnique({
                where: { id: contact.mergedIntoId },
            });
        }
        if (contact?.organizationId !== ctx.organizationId) {
            throw new NotFoundException("Contact not found");
        }
        return asTheyStand(dto.startAt, contact);
    }

    if (dto.bookerEmail) {
        // An email that is already someone's picks that someone (E4), as
        // they stand: booking them never renames them or forks a second
        // contact.
        const known = await prisma.contact.findUnique({
            where: {
                organizationId_email: {
                    organizationId: ctx.organizationId,
                    email: dto.bookerEmail.trim().toLowerCase(),
                },
            },
        });
        if (known) return asTheyStand(dto.startAt, known);
        return {
            startAt: dto.startAt,
            bookerEmail: dto.bookerEmail,
            bookerName: given(dto.bookerName),
            bookerPhone: bookerPhoneE164(dto.bookerPhone),
        };
    }

    const phone = bookerPhoneE164(dto.bookerPhone);
    if (phone) {
        const key = bookerPhoneKey(phone);
        const name = given(dto.bookerName)?.trim();
        if (!name) {
            throw new BadRequestException({
                message: BOOKER_NAME_MESSAGE,
                field: "bookerName",
            });
        }
        // The phone already someone's books them, as they stand.
        const id = await contactByPhone(prisma, ctx.organizationId, key);
        const known = id
            ? await prisma.contact.findUnique({ where: { id } })
            : null;
        if (known) return asTheyStand(dto.startAt, known);
        return {
            startAt: dto.startAt,
            bookerName: name,
            bookerPhone: phone,
            phoneKey: key,
        };
    }

    throw new BadRequestException({
        message: NO_BOOKER_MESSAGE,
        field: "bookerPhone",
    });
}
