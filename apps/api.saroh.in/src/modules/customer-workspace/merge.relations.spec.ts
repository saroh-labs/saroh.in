import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
    contactRelations,
    MERGE_RULES,
    unruledContactRelations,
} from "./merge-plan";
import { REMOVAL_RULES, unruledRemovalRelations } from "./privacy-removal-plan";

/**
 * The schema guard (C9): every relation to `Contact` has a merge rule, so a
 * unit that adds a table naming a contact (A12's waitlist, A13's thread,
 * D11's mandate, …) can't ship without saying what a merge does with it.
 * The same check for privacy removal (C11) is below.
 *
 * Reads `schema.prisma` itself: the generated client's DMMF doesn't say
 * which side of a relation holds the foreign key.
 */
const schema = readFileSync(
    resolve(__dirname, "../../../../../packages/database/prisma/schema.prisma"),
    "utf8",
);

describe("every relation to Contact has a merge rule", () => {
    it("finds the relations there are today", () => {
        // A sanity floor, so a parser that finds nothing can't pass.
        expect(contactRelations(schema)).toEqual(
            expect.arrayContaining([
                "Booking.contactId",
                "Contact.mergedIntoId",
                "CustomerAccount.contactId",
                "CustomerAccount.unlinkedFromContactId",
                "Lead.contactId",
            ]),
        );
    });

    it("covers the schema as it is", () => {
        expect(unruledContactRelations(schema)).toEqual([]);
    });

    it("names no relation the schema no longer has", () => {
        const present = new Set(contactRelations(schema));
        expect(
            Object.keys(MERGE_RULES).filter((key) => !present.has(key)),
        ).toEqual([]);
    });

    it("fails when a new table names a contact without a rule", () => {
        const withNew = `${schema}
model CourseMakeUpRequest {
  id        String  @id @default(cuid())
  contactId String
  contact   Contact @relation(fields: [contactId, organizationId], references: [id, organizationId], onDelete: Cascade)
}
`;
        expect(unruledContactRelations(withNew)).toEqual([
            "CourseMakeUpRequest.contactId",
        ]);
    });

    it("counts only the side that holds the key, never a back-relation list", () => {
        expect(
            contactRelations(schema).filter((k) => k.startsWith("Contact.")),
        ).toEqual(["Contact.mergedIntoId"]);
    });
});

/**
 * The same guard for a privacy removal (C11): every relation to `Contact`
 * says what removing the person's details does with it.
 */
describe("every relation to Contact has a privacy removal rule", () => {
    it("covers the schema as it is", () => {
        expect(unruledRemovalRelations(schema)).toEqual([]);
    });

    it("names no relation the schema no longer has", () => {
        const present = new Set(contactRelations(schema));
        expect(
            Object.keys(REMOVAL_RULES).filter((key) => !present.has(key)),
        ).toEqual([]);
    });

    it("has an explicit rule for the message thread (A13), not only the cascade", () => {
        expect(REMOVAL_RULES["CustomerThread.contactId"]).toBeDefined();
    });

    it("fails when a new table names a contact without a rule", () => {
        const withNew = `${schema}
model CourseMakeUpRequest {
  id        String  @id @default(cuid())
  contactId String
  contact   Contact @relation(fields: [contactId, organizationId], references: [id, organizationId], onDelete: Cascade)
}
`;
        expect(unruledRemovalRelations(withNew)).toEqual([
            "CourseMakeUpRequest.contactId",
        ]);
    });
});

describe("the two rule tables name the same relations", () => {
    it("merge and removal agree", () => {
        expect(Object.keys(REMOVAL_RULES).sort()).toEqual(
            Object.keys(MERGE_RULES).sort(),
        );
    });

    it("still counts only the side that holds the key", () => {
        expect(
            contactRelations(schema).filter((k) => k.startsWith("Contact.")),
        ).toEqual(["Contact.mergedIntoId"]);
    });
});
