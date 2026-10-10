/**
 * A QR code's print file against a real Postgres: the file is drawn for a
 * code the business made, with its name read from the organization; a
 * retired code and a site with no address are refused; and another
 * business reaches none of it.
 *
 * Storage is a stub: the logo's bytes are `qr-print.spec.ts`'s to prove,
 * and no test bucket is needed for what is proved here.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
jest.mock("./module-pages", () => ({
    modulePageState: jest.fn().mockResolvedValue({ state: "on" }),
}));

import { ConflictException, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { MediaService } from "../media/media.service";
import { QrCodesService } from "./qr-codes.service";
import { QR_PRINT_FORMATS, qrPrintPage } from "./qr-print";
import { QrPrintService } from "./qr-print.service";

const codes = new QrCodesService();
const readReadyObjectStart = jest.fn().mockResolvedValue(null);
const prints = new QrPrintService(codes, {
    readReadyObjectStart,
} as unknown as MediaService);

let seq = 0;
const uniq = (label: string) => `${label}-${process.pid}-${++seq}`;

interface Business {
    organizationId: string;
    siteId: string;
    owner: OrganizationContext;
}

/** A business with an owner and a site at a Saroh address (or none). */
async function business(address: boolean = true): Promise<Business> {
    const org = await prisma.organization.create({
        data: { name: "Rye & Co.", slug: uniq("qrp-org") },
    });
    const user = await prisma.user.create({
        data: { email: `${uniq("qrp-owner")}@example.test` },
    });
    await prisma.membership.create({
        data: { organizationId: org.id, userId: user.id, role: "OWNER" },
    });
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name: "Rye & Co.",
            slug: uniq("qrp-site"),
            subdomain: address ? uniq("qrp-rye").toLowerCase() : null,
        },
    });
    return {
        organizationId: org.id,
        siteId: site.id,
        owner: { organizationId: org.id, userId: user.id, role: "OWNER" },
    };
}

function mediaBox(pdf: Buffer): number[] {
    const m = /\/MediaBox \[([^\]]+)\]/.exec(pdf.toString("latin1"));
    return (m?.[1] ?? "").trim().split(/\s+/).map(Number);
}

async function reason(work: Promise<unknown>): Promise<unknown> {
    const err = await work.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictException);
    return (
        (err as ConflictException).getResponse() as {
            details?: { reason?: string };
        }
    ).details?.reason;
}

afterAll(async () => {
    await prisma.$disconnect();
});

describe("a QR code's print files (DB)", () => {
    it("draws every format for a code the business made, named for the business", async () => {
        const b = await business();
        const made = await codes.create(b.owner, b.siteId, {
            targetKind: "SITE",
            place: "COUNTER",
            label: "Scan to visit",
        });
        for (const format of QR_PRINT_FORMATS) {
            const out = await prints.print(b.owner, b.siteId, made.id, format);
            expect(out.fileName).toBe(`rye-co-qr-${made.code}-${format}.pdf`);
            expect(out.logo).toBe("none");
            expect(out.file.subarray(0, 5).toString("latin1")).toBe("%PDF-");
            const page = qrPrintPage(format);
            const box = mediaBox(out.file);
            expect(box[2]).toBeCloseTo(page.width, 1);
            expect(box[3]).toBeCloseTo(page.height, 1);
        }
    });

    it("draws a branded code with initials when the business has no logo", async () => {
        const b = await business();
        const row = await prisma.qrCode.create({
            data: {
                siteId: b.siteId,
                organizationId: b.organizationId,
                code: "h7c",
                targetKind: "SITE",
                place: "CARD",
                style: "BRANDED",
                color: "#0b5d3b",
            },
        });
        const out = await prints.print(b.owner, b.siteId, row.id, "card");
        expect(out.logo).toBe("initials");
        expect(readReadyObjectStart).not.toHaveBeenCalled();
    });

    it("refuses a retired code, and a site with no address", async () => {
        const b = await business();
        const made = await codes.create(b.owner, b.siteId, {
            targetKind: "SITE",
            place: "MIRROR",
        });
        await codes.retire(b.owner, b.siteId, made.id);
        expect(
            await reason(prints.print(b.owner, b.siteId, made.id, "sticker")),
        ).toBe("retired");

        const bare = await business(false);
        const row = await prisma.qrCode.create({
            data: {
                siteId: bare.siteId,
                organizationId: bare.organizationId,
                code: "k9d",
                targetKind: "SITE",
                place: "CARD",
                color: "#1c1c1a",
            },
        });
        expect(
            await reason(prints.print(bare.owner, bare.siteId, row.id, "card")),
        ).toBe("no-address");
    });

    it("answers 404 to another business, by its own site or by the other's", async () => {
        const a = await business();
        const b = await business();
        const made = await codes.create(a.owner, a.siteId, {
            targetKind: "SITE",
            place: "CARD",
        });
        await expect(
            prints.print(b.owner, a.siteId, made.id, "card"),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
            prints.print(b.owner, b.siteId, made.id, "card"),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});
