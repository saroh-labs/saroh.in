import { BadRequestException, ForbiddenException } from "@nestjs/common";

jest.mock("@saroh/database", () => {
    const client = {
        organization: { findUnique: jest.fn(), update: jest.fn() },
        businessProfile: {
            upsert: jest.fn(),
            findUnique: jest.fn(),
            updateMany: jest.fn(),
        },
        order: { findFirst: jest.fn().mockResolvedValue(null) },
        invoiceSequence: { findMany: jest.fn().mockResolvedValue([]) },
        product: { count: jest.fn().mockResolvedValue(0) },
        service: { count: jest.fn().mockResolvedValue(0) },
        booking: { count: jest.fn().mockResolvedValue(0) },
        site: { count: jest.fn().mockResolvedValue(0) },
        invoice: { count: jest.fn().mockResolvedValue(0) },
    };
    return {
        prisma: {
            ...client,
            $transaction: jest.fn((cb: (tx: typeof client) => unknown) =>
                cb(client),
            ),
        },
    };
});

import { prisma } from "@saroh/database";
import { EDITION_PROFILES } from "@saroh/edition";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import type { OrgRole } from "../../common/types/organization-context";
import type { AuditService } from "../audit/audit.service";
import type { MediaService } from "../media/media.service";
import {
    businessPayInstructionsOf,
    normalisePayField,
    PAY_INSTRUCTIONS_OFF,
    payInstructionsWrite,
    payWaysWords,
    publicPayInstructions,
} from "./business-pay-instructions";
import { UpdateOrganizationDto } from "./dto";
import { OrganizationSettingsService } from "./organization-settings.service";

// Made-up details: never a real UPI ID or account.
const UPI = "rye.studio@okexample";
const ACCOUNT = "123456789012";
const IFSC_CODE = "ABCD0123456";

const orgFindUnique = prisma.organization.findUnique as jest.Mock;
const profileUpsert = prisma.businessProfile.upsert as jest.Mock;
const profileFindUnique = prisma.businessProfile.findUnique as jest.Mock;

const refusal = (fn: () => unknown) => {
    try {
        fn();
    } catch (e) {
        return (e as BadRequestException).getResponse();
    }
    throw new Error("expected a refusal");
};

/**
 * Global's How to pay us is off (owner, 6 Nov 2026), its per-country rules
 * kept: these judge them as they will be when it is switched back on.
 */
const withGlobalPayOn = () => {
    beforeAll(() => {
        EDITION_PROFILES.GLOBAL.payInstructionsOffered = true;
    });
    afterAll(() => {
        EDITION_PROFILES.GLOBAL.payInstructionsOffered = false;
    });
};

describe("normalisePayField (R32)", () => {
    it("keeps a UPI ID lower-cased and trimmed", () => {
        expect(normalisePayField("upiId", "  Rye.Studio@OKExample ")).toEqual({
            value: UPI,
        });
    });

    it.each(["rye.studio", "@okexample", "rye studio@okexample", "a@1bank"])(
        "refuses %p as a UPI ID",
        (raw) => {
            expect(normalisePayField("upiId", raw)).toEqual({
                problem: expect.stringContaining("UPI ID"),
            });
        },
    );

    it("strips spaces and dashes from an account number", () => {
        expect(
            normalisePayField("bankAccountNumber", "1234 5678-9012"),
        ).toEqual({ value: ACCOUNT });
    });

    it("refuses an account number with letters, or too short or long", () => {
        expect(normalisePayField("bankAccountNumber", "12AB56789")).toEqual({
            problem: "An account number is digits only.",
        });
        expect(normalisePayField("bankAccountNumber", "12345678")).toEqual({
            problem: "An account number is 9 to 18 digits.",
        });
        expect(normalisePayField("bankAccountNumber", "1".repeat(19))).toEqual({
            problem: "An account number is 9 to 18 digits.",
        });
    });

    it("upper-cases an IFSC and checks its shape", () => {
        expect(normalisePayField("bankIfsc", "abcd0123456")).toEqual({
            value: IFSC_CODE,
        });
        // The fifth character is always 0.
        expect(normalisePayField("bankIfsc", "ABCD1123456")).toEqual({
            problem: expect.stringContaining("IFSC"),
        });
        expect(normalisePayField("bankIfsc", "ABC0123456")).toEqual({
            problem: expect.stringContaining("IFSC"),
        });
    });

    it("clears any field with an empty or blank string", () => {
        expect(normalisePayField("note", "   ")).toEqual({ value: null });
        expect(normalisePayField("upiId", "")).toEqual({ value: null });
    });

    it("caps the note and the names", () => {
        expect(normalisePayField("note", "x".repeat(281))).toEqual({
            problem: "Keep the note to 280 characters.",
        });
        expect(normalisePayField("bankAccountName", "x".repeat(101))).toEqual({
            problem: "Keep the account name to 100 characters.",
        });
    });
});

describe("payInstructionsWrite (R32)", () => {
    it("writes only the fields sent, as columns", () => {
        expect(payInstructionsWrite({ upiId: UPI }, null)).toEqual({
            payUpiId: UPI,
        });
        expect(payInstructionsWrite({}, null)).toEqual({});
        expect(payInstructionsWrite(undefined, null)).toEqual({});
    });

    it("names the field it refuses", () => {
        expect(
            refusal(() => payInstructionsWrite({ bankIfsc: "X" }, null)),
        ).toEqual(expect.objectContaining({ details: { field: "bankIfsc" } }));
    });

    it("takes bank details whole: number, IFSC and the name on the account", () => {
        expect(
            payInstructionsWrite(
                {
                    bankAccountName: "Rye Studio",
                    bankAccountNumber: ACCOUNT,
                    bankIfsc: IFSC_CODE,
                    bankName: "Example Bank",
                },
                null,
            ),
        ).toEqual({
            payBankAccountName: "Rye Studio",
            payBankAccountNumber: ACCOUNT,
            payBankIfsc: IFSC_CODE,
            payBankName: "Example Bank",
        });
        expect(
            refusal(() =>
                payInstructionsWrite(
                    {
                        bankAccountName: "Rye Studio",
                        bankAccountNumber: ACCOUNT,
                    },
                    null,
                ),
            ),
        ).toEqual(expect.objectContaining({ details: { field: "bankIfsc" } }));
        expect(
            refusal(() =>
                payInstructionsWrite(
                    { bankAccountNumber: ACCOUNT, bankIfsc: IFSC_CODE },
                    null,
                ),
            ),
        ).toEqual(
            expect.objectContaining({ details: { field: "bankAccountName" } }),
        );
    });

    it("judges bank details as they will stand with what is saved", () => {
        const saved = {
            payBankAccountName: "Rye Studio",
            payBankAccountNumber: ACCOUNT,
            payBankIfsc: IFSC_CODE,
        };
        // Changing one part keeps the rest.
        expect(
            payInstructionsWrite({ bankIfsc: "WXYZ0654321" }, saved),
        ).toEqual({ payBankIfsc: "WXYZ0654321" });
        // Clearing one part alone leaves a number nobody can pay into.
        expect(
            refusal(() => payInstructionsWrite({ bankIfsc: "" }, saved)),
        ).toEqual(expect.objectContaining({ details: { field: "bankIfsc" } }));
        // Clearing them all is fine.
        expect(
            payInstructionsWrite(
                {
                    bankAccountName: "",
                    bankAccountNumber: "",
                    bankIfsc: "",
                    bankName: "",
                },
                saved,
            ),
        ).toEqual({
            payBankAccountName: null,
            payBankAccountNumber: null,
            payBankIfsc: null,
            payBankName: null,
        });
    });
});

describe("publicPayInstructions (R32)", () => {
    const whole = {
        payUpiId: UPI,
        payBankAccountName: "Rye Studio",
        payBankAccountNumber: ACCOUNT,
        payBankIfsc: IFSC_CODE,
        payBankName: null,
        payNote: " Send a screenshot once paid. ",
    };

    it("is null when nothing is set", () => {
        expect(publicPayInstructions(null)).toBeNull();
        expect(publicPayInstructions({})).toBeNull();
        expect(publicPayInstructions({ payNote: "  " })).toBeNull();
    });

    it("shows what is set, the note trimmed", () => {
        expect(publicPayInstructions(whole)).toEqual({
            upiId: UPI,
            bankAccountName: "Rye Studio",
            bankAccountNumber: ACCOUNT,
            bankIfsc: IFSC_CODE,
            bankName: null,
            note: "Send a screenshot once paid.",
        });
    });

    it("re-checks on the way out: a bad UPI ID or half the bank details are left out", () => {
        expect(
            publicPayInstructions({
                ...whole,
                payUpiId: "not-a-upi",
                payBankIfsc: null,
            }),
        ).toEqual({
            upiId: null,
            bankAccountName: null,
            bankAccountNumber: null,
            bankIfsc: null,
            bankName: null,
            note: "Send a screenshot once paid.",
        });
    });

    it("reads one business's profile, by the id it is handed", async () => {
        profileFindUnique.mockResolvedValueOnce(whole);
        await expect(businessPayInstructionsOf("org_1")).resolves.toEqual(
            expect.objectContaining({ upiId: UPI }),
        );
        expect(profileFindUnique).toHaveBeenCalledWith(
            expect.objectContaining({ where: { organizationId: "org_1" } }),
        );
    });
});

describe("payWaysWords (R32)", () => {
    const none = {
        upiId: null,
        bankAccountName: null,
        bankAccountNumber: null,
        bankIfsc: null,
        bankName: null,
        note: null,
    };
    it("says which ways are set, for the invoice email", () => {
        expect(
            payWaysWords({ ...none, upiId: UPI, bankAccountNumber: ACCOUNT }),
        ).toBe("by UPI or bank transfer");
        expect(payWaysWords({ ...none, upiId: UPI })).toBe("by UPI");
        expect(payWaysWords({ ...none, bankAccountNumber: ACCOUNT })).toBe(
            "by bank transfer",
        );
        expect(payWaysWords({ ...none, note: "Cash only" })).toBeNull();
        expect(payWaysWords(null)).toBeNull();
    });
});

describe("while Global takes payment through Stripe only (DEC-208)", () => {
    const whole = {
        payBankAccountName: "Example Traders",
        payBankAccountNumber: "GB82WEST12345698765432",
        payBankIfsc: null,
        payNote: "Thanks",
        country: "GB",
    };

    it("refuses any pay write from a Global business, calmly", () => {
        expect(
            refusal(() =>
                payInstructionsWrite(
                    { bankAccountName: "Example Traders" },
                    null,
                    "GLOBAL",
                ),
            ),
        ).toMatchObject({
            message: PAY_INSTRUCTIONS_OFF,
            details: { field: "payInstructions" },
        });
        expect(() =>
            payInstructionsWrite({ note: "" }, null, "GLOBAL"),
        ).toThrow(BadRequestException);
        expect(payInstructionsWrite({}, null, "GLOBAL")).toEqual({});
    });

    it("still takes India's write", () => {
        expect(payInstructionsWrite({ upiId: UPI }, null, "INDIA")).toEqual({
            payUpiId: UPI,
        });
    });

    it("shows a Global customer nothing, even from a row saved before", () => {
        expect(
            publicPayInstructions({
                ...whole,
                organization: { edition: "GLOBAL" },
            }),
        ).toBeNull();
        expect(
            publicPayInstructions({
                payUpiId: UPI,
                payBankAccountName: "Rye Studio",
                payBankAccountNumber: ACCOUNT,
                payBankIfsc: IFSC_CODE,
                organization: { edition: "INDIA" },
            }),
        ).toMatchObject({ upiId: UPI, bankAccountNumber: ACCOUNT });
    });

    it("so the invoice email names no bank transfer for a Global business", async () => {
        profileFindUnique.mockResolvedValue({
            ...whole,
            organization: { edition: "GLOBAL" },
        });
        const view = await businessPayInstructionsOf("org_1");
        expect(view).toBeNull();
        expect(payWaysWords(view)).toBeNull();
    });

    it("the settings save refuses it and writes nothing", async () => {
        const service = new OrganizationSettingsService(
            { record: jest.fn() } as unknown as AuditService,
            {} as MediaService,
        );
        profileUpsert.mockClear();
        await expect(
            service.update(
                {
                    organizationId: "org_1",
                    userId: "user_1",
                    role: "OWNER",
                    edition: "GLOBAL",
                },
                { payInstructions: { note: "Thanks" } },
            ),
        ).rejects.toMatchObject({
            response: { message: PAY_INSTRUCTIONS_OFF },
        });
        expect(profileUpsert).not.toHaveBeenCalled();
    });
});

describe("a Global business's pay instructions (DEC-204)", () => {
    withGlobalPayOn();
    const write = (
        input: Parameters<typeof payInstructionsWrite>[0],
        current: Parameters<typeof payInstructionsWrite>[1] = null,
    ) => payInstructionsWrite(input, current, "GLOBAL");
    const inCountry = (
        country: string,
        input: Parameters<typeof payInstructionsWrite>[0],
        kept: Record<string, string> = {},
    ) => write(input, { country, ...kept });
    const bank = { bankAccountName: "Example Traders" };
    const refusal = (fn: () => unknown) => {
        try {
            fn();
        } catch (e) {
            return (e as BadRequestException).getResponse();
        }
        throw new Error("It was not refused");
    };

    it("accepts an IBAN, spaces removed and in capitals, with no bank code", () => {
        expect(
            write({
                ...bank,
                bankAccountNumber: "gb82 west 1234 5698 7654 32",
            }),
        ).toEqual({
            payBankAccountName: "Example Traders",
            payBankAccountNumber: "GB82WEST12345698765432",
        });
    });

    it("a UK business gives an IBAN, checked, and an optional SWIFT/BIC", () => {
        expect(
            inCountry("GB", {
                ...bank,
                bankAccountNumber: "GB82 WEST 1234 5698 7654 32",
                bankSwift: "nwbk gb 2l",
            }),
        ).toEqual({
            payBankAccountName: "Example Traders",
            payBankAccountNumber: "GB82WEST12345698765432",
            payBankIfsc: "NWBKGB2L",
        });
        expect(
            refusal(() =>
                inCountry("GB", {
                    ...bank,
                    bankAccountNumber: "GB83WEST12345698765432",
                }),
            ),
        ).toEqual({
            message:
                "That IBAN doesn't check out. Look for a missing or swapped character.",
            details: { field: "bankAccountNumber" },
        });
        // A sort code isn't a SWIFT/BIC.
        expect(
            refusal(() =>
                inCountry("GB", {
                    ...bank,
                    bankAccountNumber: "GB82WEST12345698765432",
                    bankSwift: "12-34-56",
                }),
            ),
        ).toMatchObject({ details: { field: "bankSwift" } });
        expect(
            refusal(() =>
                inCountry("GB", { ...bank, bankAccountNumber: "" }, {}),
            ),
        ).toMatchObject({
            message: "Add the IBAN, or clear the bank details.",
        });
    });

    it("a US business gives a routing number that checks, then its SWIFT/BIC", () => {
        expect(
            inCountry("US", {
                ...bank,
                bankAccountNumber: "0001 2345 6789",
                bankIfsc: "021000021",
                bankSwift: "BOFAUS3N",
            }),
        ).toMatchObject({
            payBankAccountNumber: "000123456789",
            payBankIfsc: "021000021 BOFAUS3N",
        });
        expect(
            refusal(() =>
                inCountry("US", {
                    ...bank,
                    bankAccountNumber: "000123456789",
                    bankIfsc: "021000022",
                }),
            ),
        ).toEqual({
            message:
                "That routing number doesn't check out. Look for a missing or swapped digit.",
            details: { field: "bankIfsc" },
        });
        expect(
            refusal(() =>
                inCountry("US", { ...bank, bankAccountNumber: "000123456789" }),
            ),
        ).toEqual({
            message:
                "Add the routing number: a transfer needs it with the account number.",
            details: { field: "bankIfsc" },
        });
    });

    it("changing the SWIFT/BIC alone keeps the code, and clearing it keeps it too", () => {
        const kept = {
            payBankAccountName: "Example Traders",
            payBankAccountNumber: "1234567",
            payBankIfsc: "12345-003 ROYCCAT2",
        };
        expect(inCountry("CA", { bankSwift: "ROYCCAT2XXX" }, kept)).toEqual({
            payBankIfsc: "12345-003 ROYCCAT2XXX",
        });
        expect(inCountry("CA", { bankSwift: "" }, kept)).toEqual({
            payBankIfsc: "12345-003",
        });
        expect(inCountry("CA", { bankIfsc: "000454321" }, kept)).toEqual({
            payBankIfsc: "54321-004 ROYCCAT2",
        });
    });

    it.each([
        ["AU", "12345678", "062000", "062-000"],
        ["SG", "1234567890", "7171 081", "7171-081"],
        ["ZA", "6212345678", "250655", "250655"],
    ])(
        "a business in %s saves its account and its own code",
        (country, account, code, stored) => {
            expect(
                inCountry(country, {
                    ...bank,
                    bankAccountNumber: account,
                    bankIfsc: code,
                }),
            ).toMatchObject({
                payBankAccountNumber: account,
                payBankIfsc: stored,
            });
        },
    );

    it("a New Zealand business gives one number, and no other code", () => {
        expect(
            inCountry("NZ", {
                ...bank,
                bankAccountNumber: "12-3456-7654321-00",
            }),
        ).toMatchObject({ payBankAccountNumber: "123456765432100" });
        expect(
            refusal(() =>
                inCountry("NZ", {
                    ...bank,
                    bankAccountNumber: "123456765432100",
                    bankIfsc: "123456",
                }),
            ),
        ).toMatchObject({ details: { field: "bankIfsc" } });
    });

    it("anywhere else: an account number and a SWIFT/BIC", () => {
        expect(
            inCountry("JP", {
                ...bank,
                bankAccountNumber: "1234567",
                bankSwift: "MHCBJPJT",
            }),
        ).toMatchObject({
            payBankAccountNumber: "1234567",
            payBankIfsc: "MHCBJPJT",
        });
    });

    it("refuses a UPI ID on its field, and in the account number's", () => {
        expect(refusal(() => write({ upiId: "asha@okexample" }))).toMatchObject(
            { details: { field: "upiId" } },
        );
        expect(
            refusal(() =>
                write({ ...bank, bankAccountNumber: "asha@okexample" }),
            ),
        ).toMatchObject({ details: { field: "bankAccountNumber" } });
    });

    it("lets a stale UPI ID be cleared", () => {
        expect(write({ upiId: "" })).toEqual({ payUpiId: null });
    });

    it.each([
        ["bankAccountNumber", "not an account"],
        ["bankAccountNumber", "ABCD-EFGH"],
        ["bankAccountNumber", "1".repeat(35)],
        ["bankIfsc", "???"],
        ["bankIfsc", "---"],
        ["bankIfsc", "1".repeat(35)],
    ] as const)("refuses %s of %s", (field, value) => {
        expect(normalisePayField(field, value, "GLOBAL")).toHaveProperty(
            "problem",
        );
    });

    it("takes 34 characters, once an account's spaces are removed", () => {
        expect(
            normalisePayField(
                "bankAccountNumber",
                `${"1".repeat(30)} ${"2".repeat(4)}`,
                "GLOBAL",
            ),
        ).toEqual({ value: `${"1".repeat(30)}${"2".repeat(4)}` });
    });

    it("still wants the name and the number together", () => {
        expect(
            refusal(() => write({ bankAccountNumber: "12345678" })),
        ).toMatchObject({ details: { field: "bankAccountName" } });
        expect(refusal(() => write(bank))).toMatchObject({
            details: { field: "bankAccountNumber" },
        });
    });

    it("shows a customer no UPI ID, and whole details without a code", () => {
        expect(
            publicPayInstructions({
                organization: { edition: "GLOBAL" },
                payUpiId: "asha@okexample",
                payBankAccountName: "Example Traders",
                payBankAccountNumber: "12345678",
                payBankIfsc: null,
                payBankName: null,
                payNote: null,
            }),
        ).toEqual({
            upiId: null,
            bankAccountName: "Example Traders",
            bankAccountNumber: "12345678",
            bankIfsc: null,
            bankName: null,
            note: null,
            edition: "GLOBAL",
            bankSwift: null,
            country: null,
            bankLabels: {
                account: "Account number",
                code: null,
                swift: "SWIFT/BIC",
            },
        });
    });

    it("shows a customer the US labels, the code and SWIFT/BIC apart, and hides a code that fails", () => {
        const row = {
            organization: { edition: "GLOBAL" as const },
            country: "US",
            payBankAccountName: "Example Traders",
            payBankAccountNumber: "000123456789",
            payBankIfsc: "021000021 BOFAUS3N",
        };
        expect(publicPayInstructions(row)).toMatchObject({
            bankAccountNumber: "000123456789",
            bankIfsc: "021000021",
            bankSwift: "BOFAUS3N",
            country: "US",
            bankLabels: {
                account: "Account number",
                code: "Routing number",
                swift: "SWIFT/BIC",
            },
        });
        // Bad ABA check digit: bank details are only any use whole.
        expect(
            publicPayInstructions({ ...row, payBankIfsc: "021000022" }),
        ).toBeNull();
        expect(
            publicPayInstructions({
                ...row,
                country: "DE",
                payBankAccountNumber: "DE89370400440532013000",
                payBankIfsc: null,
            }),
        ).toMatchObject({ bankLabels: { account: "IBAN", code: null } });
    });

    it("says only bank transfer in the invoice email's words", () => {
        expect(
            payWaysWords(
                publicPayInstructions({
                    organization: { edition: "GLOBAL" },
                    payUpiId: "asha@okexample",
                    payBankAccountName: "Example Traders",
                    payBankAccountNumber: "12345678",
                }),
            ),
        ).toBe("by bank transfer");
    });

    it("leaves India's rules as they were", () => {
        expect(
            normalisePayField("bankAccountNumber", "12345678", "INDIA"),
        ).toEqual({ problem: "An account number is 9 to 18 digits." });
        expect(
            normalisePayField("bankIfsc", "021000021", "INDIA"),
        ).toHaveProperty("problem");
        expect(
            refusal(() =>
                payInstructionsWrite(
                    { ...bank, bankAccountNumber: "123456789012" },
                    null,
                    "INDIA",
                ),
            ),
        ).toMatchObject({ details: { field: "bankIfsc" } });
    });

    it("the save reads the business's own country, and judges by it", async () => {
        const service = new OrganizationSettingsService(
            { record: jest.fn() } as unknown as AuditService,
            {} as MediaService,
        );
        profileFindUnique.mockResolvedValue({ country: "US" });
        const ctx = {
            organizationId: "org_1",
            userId: "user_1",
            role: "OWNER" as const,
            edition: "GLOBAL" as const,
        };
        await expect(
            service.update(ctx, {
                payInstructions: {
                    bankAccountName: "Example Traders",
                    bankAccountNumber: "000123456789",
                    bankIfsc: "021000022",
                },
            }),
        ).rejects.toMatchObject({
            response: { details: { field: "bankIfsc" } },
        });
        expect(profileFindUnique).toHaveBeenCalledWith(
            expect.objectContaining({
                select: expect.objectContaining({ country: true }),
            }),
        );
    });

    it("the save goes by the business's edition, not by anything sent", async () => {
        const service = new OrganizationSettingsService(
            { record: jest.fn() } as unknown as AuditService,
            {} as MediaService,
        );
        profileFindUnique.mockResolvedValue(null);
        const ctx = {
            organizationId: "org_1",
            userId: "user_1",
            role: "OWNER" as const,
            edition: "GLOBAL" as const,
        };
        await expect(
            service.update(ctx, {
                payInstructions: { upiId: "asha@okexample" },
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(
            await validate(
                plainToInstance(UpdateOrganizationDto, {
                    payInstructions: { bankIfsc: "1".repeat(34) },
                }),
            ),
        ).toEqual([]);
    });
});

describe("UpdateOrganizationDto.payInstructions", () => {
    it("takes the six text fields and refuses anything else", async () => {
        const ok = plainToInstance(UpdateOrganizationDto, {
            payInstructions: { upiId: UPI, note: "Thanks" },
        });
        expect(
            await validate(ok, { forbidNonWhitelisted: true, whitelist: true }),
        ).toEqual([]);
        const bad = plainToInstance(UpdateOrganizationDto, {
            payInstructions: { upiId: 42 },
        });
        expect(await validate(bad)).not.toEqual([]);
    });
});

describe("OrganizationSettingsService: how to pay us (R32)", () => {
    withGlobalPayOn();
    const record = jest.fn().mockResolvedValue(undefined);
    const service = new OrganizationSettingsService(
        { record } as unknown as AuditService,
        {} as MediaService,
    );
    const ctx = (role: OrgRole = "OWNER") => ({
        organizationId: "org_1",
        userId: "user_1",
        role,
    });

    beforeEach(() => {
        jest.clearAllMocks();
        profileFindUnique.mockResolvedValue(null);
        orgFindUnique.mockResolvedValue({
            id: "org_1",
            name: "Rye",
            slug: "rye",
            businessProfile: {
                legalName: null,
                type: null,
                country: "IN",
                taxId: null,
                contactEmail: null,
                website: null,
                payUpiId: UPI,
            },
        });
    });

    it("tells the sheet a Global business's edition, and says nothing for India", async () => {
        const india = await service.update(ctx(), {
            payInstructions: { note: "Thanks" },
        });
        expect(india.payInstructions).not.toHaveProperty("edition");
        orgFindUnique.mockResolvedValue({
            id: "org_1",
            name: "Rye",
            slug: "rye",
            edition: "GLOBAL",
            businessProfile: null,
        });
        const global = await service.update(
            { ...ctx(), edition: "GLOBAL" },
            { payInstructions: { note: "Thanks" } },
        );
        expect(global.payInstructions.edition).toBe("GLOBAL");
    });

    it("saves for an Owner or Admin, and audits by name only", async () => {
        for (const role of ["OWNER", "ADMIN"] as const) {
            record.mockClear();
            await service.update(ctx(role), {
                payInstructions: { upiId: ` ${UPI.toUpperCase()} ` },
            });
            expect(profileUpsert).toHaveBeenLastCalledWith(
                expect.objectContaining({ update: { payUpiId: UPI } }),
            );
            const row = record.mock.calls[0]?.[0] as {
                metadata: { fields: string[]; changes: unknown[] };
            };
            expect(row.metadata.fields).toEqual(["payUpiId"]);
            expect(JSON.stringify(row.metadata)).not.toContain("rye.studio");
        }
    });

    it("refuses a Member or a Reviewer, and writes nothing", async () => {
        for (const role of ["MEMBER", "REVIEWER"] as const) {
            await expect(
                service.update(ctx(role), { payInstructions: { upiId: UPI } }),
            ).rejects.toBeInstanceOf(ForbiddenException);
        }
        expect(profileUpsert).not.toHaveBeenCalled();
    });

    it("refuses a bad IFSC on its field before anything is written", async () => {
        const answer = await service
            .update(ctx(), { payInstructions: { bankIfsc: "HDFC123" } })
            .catch((e: BadRequestException) => e.getResponse());
        expect(answer).toEqual(
            expect.objectContaining({ details: { field: "bankIfsc" } }),
        );
        expect(prisma.$transaction).not.toHaveBeenCalled();
        expect(record).not.toHaveBeenCalled();
    });

    it("reads them back apart from the profile, and only for Owner/Admin", async () => {
        const settings = await service.get(ctx("ADMIN"));
        expect(settings.payInstructions).toEqual({
            upiId: UPI,
            bankAccountName: null,
            bankAccountNumber: null,
            bankIfsc: null,
            bankName: null,
            note: null,
        });
        expect(settings.profile).not.toHaveProperty("payUpiId");
        await expect(service.get(ctx("MEMBER"))).rejects.toBeInstanceOf(
            ForbiddenException,
        );
    });
});
