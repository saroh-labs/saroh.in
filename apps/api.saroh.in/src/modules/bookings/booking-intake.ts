import { BadRequestException } from "@nestjs/common";

import type { OrganizationContext } from "../../common/types/organization-context";
import { canSeeSensitive } from "../customer-workspace/attention-read";
import type { BookingLocationType } from "./dto";
import { INTAKE_NOTE_MESSAGE, MAX_INTAKE_NOTE } from "./dto";

/*
 * What the booking page asks beyond the time (E7): Where, for a service
 * offered either way, and "Anything we should know?".
 */

/**
 * Where one booking happens, as `Booking.locationType` stores it (E1's
 * column). A service offered either way records the booker's answer, in
 * person when they gave none — as it booked before the page asked. Any
 * other service stores null, "as the service says", and an answer that
 * contradicts it is refused: an in-person service has no link to hand out.
 */
export function bookingLocation(
    serviceLocation: string,
    asked: BookingLocationType | undefined,
): BookingLocationType | null {
    if (serviceLocation === "EITHER") return asked ?? "IN_PERSON";
    if (asked === undefined || asked === serviceLocation) return null;
    throw new BadRequestException(
        serviceLocation === "ONLINE"
            ? "This is only offered online."
            : "This is only offered in person.",
    );
}

/**
 * The note as it is kept: trimmed, null when empty, and refused past 1,000
 * characters. Counted as the database counts (code points), so a note the
 * DTO let through can't fail the CHECK instead.
 */
export function intakeNoteOf(raw: string | undefined | null): string | null {
    const note = raw?.trim() ?? "";
    if (!note) return null;
    if ([...note].length > MAX_INTAKE_NOTE) {
        throw new BadRequestException(INTAKE_NOTE_MESSAGE);
    }
    return note;
}

/** A booking row as staff reads it without the sensitive note. */
export type WithoutIntakeNote<T> = Omit<T, "intakeNote">;

/** The row with its intake note taken off (list reads, mutation answers). */
export function withoutIntakeNote<T extends { intakeNote?: unknown }>(
    row: T,
): WithoutIntakeNote<T> {
    const { intakeNote: _note, ...rest } = row;
    return rest;
}

/**
 * The note is served only to someone who may see sensitive Needs attention
 * (C1's gate, `canSeeSensitive`); everyone else gets the booking without it.
 */
export function intakeNoteFor<T extends { intakeNote?: unknown }>(
    ctx: OrganizationContext,
    row: T,
): T | WithoutIntakeNote<T> {
    return canSeeSensitive(ctx) ? row : withoutIntakeNote(row);
}
