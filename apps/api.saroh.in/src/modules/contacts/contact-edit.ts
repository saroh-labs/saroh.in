import { BadRequestException, ConflictException } from "@nestjs/common";
import type { Contact, Prisma } from "@saroh/database";

import type { AddressPatch, ContactAddress } from "./contact-address";
import {
    ADDRESS_FIELDS,
    changedAddressFields,
    nextAddress,
    touchesAddress,
} from "./contact-address";
import { isReservedContactEmail } from "./contact-email";
import type { UpdateContactDto } from "./dto";

/**
 * What a staff edit of a contact writes (S3-005; C8), worked out before
 * anything is written. Pure: the service looks up an email's other holder
 * and writes.
 *
 * - Name, phone and company are applied as sent.
 * - A changed email clears the verified stamp (DEC-049: staff typing an
 *   address proves nothing). It changes the contact only; a site account
 *   keeps the email it signs in with (ADR-011).
 * - The address is checked as a whole (`contact-address.ts`).
 *
 * `changed` names the parts that really changed, for the timeline's
 * "Details changed" and its audit row: names only, never a value (DEC-035).
 */
export interface ContactEdit {
    data: Prisma.ContactUpdateInput;
    changed: string[];
    /** The new email, when it changes; the caller checks no one else holds it. */
    email: string | null;
}

const DESCRIPTIVE = ["firstName", "lastName", "phone", "company"] as const;

type Current = Pick<
    Contact,
    (typeof DESCRIPTIVE)[number] | "email" | (typeof ADDRESS_FIELDS)[number]
>;

export function planContactEdit(
    current: Current,
    dto: UpdateContactDto,
): ContactEdit {
    const data: Prisma.ContactUpdateInput = {};
    const changed: string[] = [];

    for (const field of DESCRIPTIVE) {
        const value = dto[field];
        if (value === undefined) continue;
        data[field] = value;
        if ((current[field] ?? "") !== value) changed.push(field);
    }

    let email: string | null = null;
    // The DTO lower-cases what was typed; an older row may hold capitals.
    // The same address in other letters is the same person, left alone.
    if (
        dto.email !== undefined &&
        dto.email !== current.email.trim().toLowerCase()
    ) {
        if (isReservedContactEmail(dto.email)) {
            throw new BadRequestException({
                message: "That email can't be used for a customer.",
                details: { field: "email" },
            });
        }
        email = dto.email;
        data.email = dto.email;
        data.emailVerifiedAt = null;
        data.emailVerifiedVia = null;
        changed.push("email");
    }

    const patch: AddressPatch = {};
    for (const field of ADDRESS_FIELDS) {
        if (dto[field] !== undefined) patch[field] = dto[field];
    }
    if (touchesAddress(patch)) {
        const before = Object.fromEntries(
            ADDRESS_FIELDS.map((f) => [f, current[f] ?? null]),
        ) as ContactAddress;
        const after = nextAddress(before, patch);
        const moved = changedAddressFields(before, after);
        for (const field of moved) data[field] = after[field];
        if (moved.length > 0) changed.push("address");
    }

    return { data, changed, email };
}

/**
 * The 409 for an email another contact already holds, naming them (the
 * editor holds `contact:write`, so may read them). Null when a race lost
 * the email to a write that isn't known here.
 */
export function emailHeldBy(
    holder: {
        id: string;
        firstName: string | null;
        lastName: string | null;
    } | null,
): ConflictException {
    const name = holder
        ? [holder.firstName, holder.lastName].filter(Boolean).join(" ").trim()
        : "";
    if (!holder) {
        return new ConflictException({
            message: "Another customer already has this email.",
            details: { field: "email" },
        });
    }
    const shown = name || "Another customer";
    return new ConflictException({
        message: `${shown} already has this email.`,
        details: {
            field: "email",
            contactId: holder.id,
            name: name || null,
        },
    });
}
