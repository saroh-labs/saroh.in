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
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import type { OrgRole } from "../../common/types/organization-context";
import type { AuditService } from "../audit/audit.service";
import type { MediaService } from "../media/media.service";
import {
    businessPayInstructionsOf,
    normalisePayField,
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
