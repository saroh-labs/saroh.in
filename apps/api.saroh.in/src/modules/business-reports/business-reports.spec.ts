jest.mock("@saroh/database", () => {
    const prisma = {
        site: { findUnique: jest.fn() },
        domain: { findMany: jest.fn() },
        businessReport: { create: jest.fn() },
    };
    return {
        prisma,
        outsideOrgContext: jest.fn((fn: () => unknown) => fn()),
    };
});
jest.mock("../sites/site-origin", () => ({
    rendererHost: () => "saroh.app",
}));

import { BadRequestException, HttpException, Logger } from "@nestjs/common";
import { prisma } from "@saroh/database";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { BusinessReportsService } from "./business-reports.service";
import { SubmitBusinessReportDto } from "./dto";
import { PublicBusinessReportsController } from "./public-business-reports.controller";
import { businessForHost, reportHost } from "./report-host";

const db = prisma as unknown as {
    site: { findUnique: jest.Mock };
    domain: { findMany: jest.Mock };
    businessReport: { create: jest.Mock };
};

beforeEach(() => {
    jest.clearAllMocks();
    db.site.findUnique.mockResolvedValue(null);
    db.domain.findMany.mockResolvedValue([]);
    db.businessReport.create.mockResolvedValue({ id: "r1" });
});

describe("reportHost", () => {
    it.each([
        ["shop.example.com", "shop.example.com"],
        ["https://Shop.Example.com/contact?x=1", "shop.example.com"],
        ["http://kavi.saroh.app", "kavi.saroh.app"],
        ["  www.glow.in/  ", "www.glow.in"],
        ["kavi.saroh.app:443", "kavi.saroh.app"],
        ["glow.in.", "glow.in"],
    ])("reads %s as %s", (typed, host) => {
        expect(reportHost(typed)).toBe(host);
    });

    it.each([
        "",
        "   ",
        "localhost",
        "not an address",
        "ftp://glow.in",
        "javascript:alert(1)",
    ])("refuses %j", (typed) => {
        expect(reportHost(typed)).toBeNull();
    });
});

describe("businessForHost", () => {
    it("finds a platform address by its first label", async () => {
        db.site.findUnique.mockResolvedValue({ organizationId: "org_1" });
        await expect(businessForHost("kavi.saroh.app")).resolves.toBe("org_1");
        expect(db.site.findUnique).toHaveBeenCalledWith(
            expect.objectContaining({ where: { subdomain: "kavi" } }),
        );
    });

    it("never reads a first label off the root as an address", async () => {
        await expect(businessForHost("kavi.example.com")).resolves.toBeNull();
        expect(db.site.findUnique).not.toHaveBeenCalled();
        expect(db.domain.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    hostname: {
                        in: ["kavi.example.com", "www.kavi.example.com"],
                    },
                    status: "VERIFIED",
                },
            }),
        );
    });

    it("finds a verified custom domain, with or without www", async () => {
        db.domain.findMany.mockResolvedValue([{ organizationId: "org_2" }]);
        await expect(businessForHost("www.glow.in")).resolves.toBe("org_2");
        expect(db.domain.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    hostname: { in: ["www.glow.in", "glow.in"] },
                    status: "VERIFIED",
                },
            }),
        );
    });

    it("names nothing for the root itself", async () => {
        await expect(businessForHost("saroh.app")).resolves.toBeNull();
        expect(db.site.findUnique).not.toHaveBeenCalled();
        expect(db.domain.findMany).not.toHaveBeenCalled();
    });
});

describe("SubmitBusinessReportDto", () => {
    async function check(body: Record<string, unknown>) {
        const dto = plainToInstance(SubmitBusinessReportDto, body);
        const errors = await validate(dto, {
            whitelist: true,
            forbidNonWhitelisted: true,
        });
        return { dto, fields: errors.map((e) => e.property) };
    }

    const ok = {
        site: "glow.in",
        message: "They took my money and never sent the order.",
        email: "first.last@example.com",
        phone: "+91 98450 12345",
    };
    const without = (field: keyof typeof ok) =>
        Object.fromEntries(Object.entries(ok).filter(([key]) => key !== field));

    it("takes an address, a message, an email and a mobile number", async () => {
        const { dto, fields } = await check({
            ...ok,
            email: "  First.Last@Example.com ",
            phone: "  98450 12345 ",
        });
        expect(fields).toEqual([]);
        expect(dto.email).toBe("first.last@example.com");
        // Kept as typed, trimmed: the rule for a phone a customer types.
        expect(dto.phone).toBe("98450 12345");
    });

    it("refuses a short message and a missing address", async () => {
        expect((await check({ ...ok, message: "bad" })).fields).toEqual([
            "message",
        ]);
        expect((await check(without("site"))).fields).toEqual(["site"]);
    });

    it.each([
        ["missing", without("email")],
        ["blank", { ...ok, email: " " }],
        ["not one", { ...ok, email: "nope" }],
        ["not text", { ...ok, email: 5 }],
    ])("refuses an email that is %s (DEC-138)", async (_what, body) => {
        expect((await check(body)).fields).toEqual(["email"]);
    });

    it.each([
        ["missing", without("phone")],
        ["blank", { ...ok, phone: " " }],
        ["words", { ...ok, phone: "call me" }],
        ["too short", { ...ok, phone: "12345" }],
        ["too long", { ...ok, phone: "9".repeat(25) }],
        ["not text", { ...ok, phone: 9845012345 }],
    ])("refuses a mobile number that is %s (DEC-138)", async (_what, body) => {
        expect((await check(body)).fields).toEqual(["phone"]);
    });

    it("says what is wrong in plain words", async () => {
        const dto = plainToInstance(SubmitBusinessReportDto, {
            site: ok.site,
            message: ok.message,
        });
        const said = (await validate(dto)).flatMap((e) =>
            Object.values(e.constraints ?? {}),
        );
        expect(said).toContain("Enter an email like name@example.com.");
        expect(said).toContain("Enter a mobile number like +91 98450 12345.");
    });

    it("refuses a field it doesn't know, such as a business id", async () => {
        expect(
            (await check({ ...ok, organizationId: "org_1" })).fields,
        ).toEqual(["organizationId"]);
    });
});

describe("BusinessReportsService.submit", () => {
    const service = new BusinessReportsService();
    const WHO = { email: "first.last@example.com", phone: "+91 98450 12345" };

    it("stores the host and the business it resolved to", async () => {
        db.site.findUnique.mockResolvedValue({ organizationId: "org_1" });
        await expect(
            service.submit({
                site: "https://kavi.saroh.app/products/x",
                message: "  Never delivered.  ",
                email: "first.last@example.com",
                phone: " +91 98450 12345 ",
                ipHash: "hash",
            }),
        ).resolves.toEqual({ ok: true });
        expect(db.businessReport.create).toHaveBeenCalledWith({
            data: {
                organizationId: "org_1",
                siteHost: "kavi.saroh.app",
                message: "Never delivered.",
                reporterEmail: "first.last@example.com",
                reporterPhone: "+91 98450 12345",
                ipHash: "hash",
            },
            select: { id: true },
        });
    });

    it("keeps a report about an address that isn't a Saroh site, with no business", async () => {
        await service.submit({
            ...WHO,
            site: "glow.in",
            message: "Took my money.",
        });
        expect(db.businessReport.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    organizationId: null,
                    siteHost: "glow.in",
                    reporterEmail: WHO.email,
                    reporterPhone: WHO.phone,
                }),
            }),
        );
    });

    it("answers the same either way, so the form can't look businesses up", async () => {
        const unknown = await service.submit({
            ...WHO,
            site: "glow.in",
            message: "Took my money.",
        });
        db.site.findUnique.mockResolvedValue({ organizationId: "org_1" });
        const known = await service.submit({
            ...WHO,
            site: "kavi.saroh.app",
            message: "Took my money.",
        });
        expect(known).toEqual(unknown);
    });

    it("refuses an address it can't read", async () => {
        await expect(
            service.submit({
                ...WHO,
                site: "not an address",
                message: "Took my money.",
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(db.businessReport.create).not.toHaveBeenCalled();
    });

    it("refuses a number that is punctuation alone, which the pattern lets by", async () => {
        await expect(
            service.submit({
                ...WHO,
                phone: "------",
                site: "glow.in",
                message: "Took my money.",
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(db.businessReport.create).not.toHaveBeenCalled();
    });

    it("logs the host only, never the email or the number", async () => {
        const said: string[] = [];
        const log = jest
            .spyOn(Logger.prototype, "log")
            .mockImplementation((line: unknown) => {
                said.push(String(line));
            });
        await service.submit({
            ...WHO,
            site: "glow.in",
            message: "Took my money.",
        });
        log.mockRestore();
        expect(said).toEqual(["business report: glow.in (not a Saroh site)"]);
    });
});

describe("PublicBusinessReportsController", () => {
    const REPORT = {
        site: "glow.in",
        message: "Took my money.",
        email: "first.last@example.com",
        phone: "+91 98450 12345",
    };

    it("passes a hash of the address on, never the address", async () => {
        const submit = jest.fn().mockResolvedValue({ ok: true });
        const controller = new PublicBusinessReportsController({
            submit,
        } as unknown as BusinessReportsService);
        await controller.submit(REPORT, "203.0.113.5", undefined);
        const call = submit.mock.calls[0]?.[0] as { ipHash?: string };
        expect(call.ipHash).toBeDefined();
        expect(call.ipHash).not.toContain("203.0.113.5");
        expect(call).toMatchObject(REPORT);
    });

    it("refuses a fourth report in a minute from one address with 429", async () => {
        const submit = jest.fn().mockResolvedValue({ ok: true });
        const controller = new PublicBusinessReportsController({
            submit,
        } as unknown as BusinessReportsService);
        const send = () => controller.submit(REPORT, "203.0.113.9", undefined);
        await send();
        await send();
        await send();
        const refused = await send().catch((e: unknown) => e);
        expect(refused).toBeInstanceOf(HttpException);
        expect((refused as HttpException).getStatus()).toBe(429);
        expect(submit).toHaveBeenCalledTimes(3);
    });
});
