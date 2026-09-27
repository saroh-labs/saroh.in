// DB-free: the search's parsing, its exact-match rule and its gate. The SQL
// itself runs against Postgres in contact-search.db.spec.ts.
jest.mock("@saroh/database", () => {
    const actual = jest.requireActual("@saroh/database");
    return { ...actual, prisma: { $queryRaw: jest.fn() } };
});

import { ForbiddenException, ValidationPipe } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { validationPipeOptions } from "../../common/validation";
import { exactOn, searchContacts, searchTerms } from "./contact-search";
import { ContactsService } from "./contacts.service";
import { SearchContactsQueryDto } from "./dto";

const queryRaw = prisma.$queryRaw as jest.Mock;

function ctx(over: Partial<OrganizationContext> = {}): OrganizationContext {
    return {
        organizationId: "org_1",
        userId: "user_1",
        role: "ADMIN",
        ...over,
    };
}

/** The values bound into a Prisma.sql call, flattened. */
function boundValues(): unknown[] {
    const sql = queryRaw.mock.calls[0][0] as { values: unknown[] };
    return sql.values;
}

describe("searchTerms (E4)", () => {
    it("lists the most recent when nothing is typed", () => {
        expect(searchTerms("")).toMatchObject({ recent: true });
        expect(searchTerms("   ")).toMatchObject({ recent: true });
        expect(searchTerms(undefined)).toMatchObject({ recent: true });
    });

    it("reads a name as its words, lower-cased", () => {
        expect(searchTerms("Priya  R")).toEqual({
            words: ["priya", "r"],
            digits: [],
            email: null,
            recent: false,
        });
    });

    it("reads four or more digits as a phone", () => {
        expect(searchTerms("3210").digits).toEqual(["3210"]);
        // Fewer is not a phone anyone can be found by.
        expect(searchTerms("321")).toEqual({
            words: [],
            digits: [],
            email: null,
            recent: false,
        });
    });

    it("tries +91 98765 43210 without its 91 too, so both forms meet", () => {
        expect(searchTerms("+91 98765 43210").digits).toEqual([
            "919876543210",
            "9876543210",
        ]);
        expect(searchTerms("9876543210").digits).toEqual(["9876543210"]);
    });

    it("reads anything with an @ as the start of an email", () => {
        expect(searchTerms(" Priya@Example.com ").email).toBe(
            "priya@example.com",
        );
    });
});

describe("exactOn (E4, C2's normalisers)", () => {
    const priya = {
        email: "priya@example.com",
        phone: "+91 98765 43210",
    };

    it("is the email when the whole query is theirs, in any case", () => {
        expect(exactOn(" PRIYA@example.com", priya)).toEqual(["email"]);
    });

    it("is the phone when the number is theirs, however it is written", () => {
        expect(exactOn("9876543210", priya)).toEqual(["phone"]);
        expect(exactOn("98765-43210", priya)).toEqual(["phone"]);
    });

    it("is nothing for part of a number or a name", () => {
        expect(exactOn("3210", priya)).toEqual([]);
        expect(exactOn("Priya", priya)).toEqual([]);
    });

    it("matches a site account's email, never a placeholder", () => {
        const separate = {
            email: "account+c_2@account.invalid",
            accountEmail: "priya@example.com",
            phone: null,
        };
        expect(exactOn("priya@example.com", separate)).toEqual(["email"]);
        expect(exactOn("account+c_2@account.invalid", separate)).toEqual([]);
    });
});

describe("searchContacts (E4)", () => {
    beforeEach(() => jest.clearAllMocks());

    it("doesn't ask the database when nothing could match", async () => {
        await expect(searchContacts(prisma, "org_1", "12")).resolves.toEqual(
            [],
        );
        expect(queryRaw).not.toHaveBeenCalled();
    });

    it("scopes to the organization, caps the limit, and binds the typed text literally", async () => {
        queryRaw.mockResolvedValue([]);
        await searchContacts(prisma, "org_1", "50%_off", 99);
        const values = boundValues();
        expect(values).toContain("org_1");
        expect(values).toContain(20);
        expect(values).toContain("%50\\%\\_off%");
    });

    it("shows the account's email for a placeholder, never the placeholder", async () => {
        queryRaw.mockResolvedValue([
            {
                id: "c_2",
                firstName: "Priya",
                lastName: "Raman",
                email: "account+c_2@account.invalid",
                phone: "9876543210",
                accountEmail: "priya@example.com",
                lastSeenAt: new Date("2026-09-20T10:00:00.000Z"),
            },
            {
                id: "c_3",
                firstName: null,
                lastName: null,
                email: "removed+c_3@removed.invalid",
                phone: null,
                accountEmail: null,
                lastSeenAt: null,
            },
        ]);
        await expect(
            searchContacts(prisma, "org_1", "9876543210"),
        ).resolves.toEqual([
            {
                id: "c_2",
                name: "Priya Raman",
                email: "priya@example.com",
                phone: "9876543210",
                lastSeenAt: "2026-09-20T10:00:00.000Z",
                exactOn: ["phone"],
            },
            {
                id: "c_3",
                name: null,
                email: null,
                phone: null,
                lastSeenAt: null,
                exactOn: [],
            },
        ]);
    });
});

describe("ContactsService.search (E4)", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        queryRaw.mockResolvedValue([]);
    });

    it("is open to a Member, who reads the people on the diary", async () => {
        await expect(
            new ContactsService().search(ctx({ role: "MEMBER" }), "Priya"),
        ).resolves.toEqual([]);
        expect(queryRaw).toHaveBeenCalledTimes(1);
    });

    it("refuses a caller without contact:read with a 403, before any read", async () => {
        await expect(
            new ContactsService().search(ctx({ role: "REVIEWER" }), "Priya"),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(queryRaw).not.toHaveBeenCalled();
    });
});

describe("SearchContactsQueryDto", () => {
    const pipe = new ValidationPipe(validationPipeOptions);
    const run = (value: unknown) =>
        pipe.transform(value, {
            type: "query",
            metatype: SearchContactsQueryDto,
        }) as Promise<SearchContactsQueryDto>;

    it("trims the query and converts the limit from text", async () => {
        await expect(run({ q: "  Priya ", limit: "5" })).resolves.toEqual(
            expect.objectContaining({ q: "Priya", limit: 5 }),
        );
    });

    it("refuses a limit over 20, or not a number", async () => {
        await expect(run({ limit: "21" })).rejects.toBeDefined();
        await expect(run({ limit: "many" })).rejects.toBeDefined();
    });
});
