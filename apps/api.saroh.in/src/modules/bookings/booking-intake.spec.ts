import { BadRequestException, ValidationPipe } from "@nestjs/common";

import type { OrganizationContext } from "../../common/types/organization-context";
import { validationPipeOptions } from "../../common/validation";
import {
    bookingLocation,
    intakeNoteFor,
    intakeNoteOf,
    withoutIntakeNote,
} from "./booking-intake";
import { BookServiceDto } from "./dto";

/** Where and "Anything we should know?" on the booking page (E7). */

function ctx(role: string): OrganizationContext {
    return { organizationId: "org_1", userId: "user_1", role };
}

describe("bookingLocation", () => {
    it("records the booker's answer for a service offered either way", () => {
        expect(bookingLocation("EITHER", "ONLINE")).toBe("ONLINE");
        expect(bookingLocation("EITHER", "IN_PERSON")).toBe("IN_PERSON");
    });

    it("books an Either service in person when nobody said", () => {
        expect(bookingLocation("EITHER", undefined)).toBe("IN_PERSON");
    });

    it("leaves any other service as the service says", () => {
        expect(bookingLocation("IN_PERSON", undefined)).toBeNull();
        expect(bookingLocation("IN_PERSON", "IN_PERSON")).toBeNull();
        expect(bookingLocation("ONLINE", "ONLINE")).toBeNull();
    });

    it("refuses an answer the service can't give, with a sentence", () => {
        expect(() => bookingLocation("IN_PERSON", "ONLINE")).toThrow(
            new BadRequestException("This is only offered in person."),
        );
        expect(() => bookingLocation("ONLINE", "IN_PERSON")).toThrow(
            new BadRequestException("This is only offered online."),
        );
    });
});

describe("intakeNoteOf", () => {
    it("keeps the note trimmed", () => {
        expect(intakeNoteOf("  I take blood thinners \n")).toBe(
            "I take blood thinners",
        );
    });

    it("keeps nothing for an empty or absent note", () => {
        expect(intakeNoteOf(undefined)).toBeNull();
        expect(intakeNoteOf(null)).toBeNull();
        expect(intakeNoteOf("   \n ")).toBeNull();
    });

    it("keeps exactly 1,000 characters", () => {
        expect(intakeNoteOf("a".repeat(1000))).toHaveLength(1000);
    });

    it("refuses 1,001 characters with a sentence", () => {
        expect(() => intakeNoteOf("a".repeat(1001))).toThrow(
            new BadRequestException(
                "Keep the note to 1,000 characters or fewer.",
            ),
        );
    });

    it("counts as the database does: an emoji is one character", () => {
        expect(intakeNoteOf("🦷".repeat(1000))).not.toBeNull();
        // A variation selector is a character of its own to Postgres.
        expect(() => intakeNoteOf(`${"a".repeat(1000)}️`)).toThrow(
            BadRequestException,
        );
    });
});

describe("the note, read by staff", () => {
    const row = { id: "bk_1", intakeNote: "Nervous about needles" };

    it("goes to someone who may see sensitive Needs attention", () => {
        expect(intakeNoteFor(ctx("OWNER"), row)).toEqual(row);
        expect(intakeNoteFor(ctx("ADMIN"), row)).toEqual(row);
    });

    it("never to a Member or a Reviewer", () => {
        for (const role of ["MEMBER", "REVIEWER"]) {
            const read = intakeNoteFor(ctx(role), row);
            expect(read).toEqual({ id: "bk_1" });
            expect(JSON.stringify(read)).not.toContain("needles");
        }
    });

    it("follows the role's own capabilities, not only its name", () => {
        const custom: OrganizationContext = {
            ...ctx("FRONT_DESK"),
            actions: new Set(["booking:read", "contact:write"]),
        };
        expect(intakeNoteFor(custom, row)).toEqual(row);
    });

    it("comes off a row entirely", () => {
        expect(withoutIntakeNote(row)).toEqual({ id: "bk_1" });
        expect("intakeNote" in withoutIntakeNote(row)).toBe(false);
    });
});

describe("BookServiceDto (E7)", () => {
    const pipe = new ValidationPipe(validationPipeOptions);
    const base = {
        startAt: "2026-07-20T09:00:00.000Z",
        bookerEmail: "asha@example.in",
    };

    async function messages(
        body: Record<string, unknown>,
    ): Promise<string[] | null> {
        try {
            await pipe.transform(body, {
                type: "body",
                metatype: BookServiceDto,
            });
            return null;
        } catch (err) {
            expect(err).toBeInstanceOf(BadRequestException);
            const res = (err as BadRequestException).getResponse() as {
                message: string | string[];
            };
            return [res.message].flat();
        }
    }

    it("takes Where and a note", async () => {
        const dto = (await pipe.transform(
            { ...base, locationType: "ONLINE", intakeNote: "  Allergic  " },
            { type: "body", metatype: BookServiceDto },
        )) as BookServiceDto;
        expect(dto.locationType).toBe("ONLINE");
        expect(dto.intakeNote).toBe("Allergic");
    });

    it("refuses EITHER as an answer: a booking happens in one place", async () => {
        await expect(
            messages({ ...base, locationType: "EITHER" }),
        ).resolves.toEqual(["Where has to be in person or online."]);
    });

    it("refuses a note of 1,001 characters → 400 with a sentence", async () => {
        await expect(
            messages({ ...base, intakeNote: "a".repeat(1001) }),
        ).resolves.toEqual(["Keep the note to 1,000 characters or fewer."]);
        await expect(
            messages({ ...base, intakeNote: "a".repeat(1000) }),
        ).resolves.toBeNull();
    });
});
