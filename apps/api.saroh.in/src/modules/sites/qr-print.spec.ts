// DB-free unit tests for a QR code's print files. The database package,
// the plan meter and storage are mocked; `qr-print.db.spec.ts` proves the
// route's rules against Postgres.
//
// What is pinned: each format's page is its trim size plus the bleed, with
// the trim box and crop marks; the code is vectors, with no image unless
// the business logo is drawn; a logo that is missing, a WebP or broken
// gives initials and never fails the file; the file holds the code's short
// link on the Saroh address; and a retired code, a site with no address, a
// plan without the row and another business's code are each refused with
// their own shape.
const mockEnv: Record<string, string | undefined> = {
    NODE_ENV: "test",
    RENDERER_URL: "https://saroh.app",
};
jest.mock("../../env", () => ({ env: mockEnv, declaredNodeEnv: "test" }));

jest.mock("@saroh/database", () => {
    const client = {
        site: { findFirst: jest.fn() },
        qrCode: { findFirst: jest.fn() },
        organization: { findUnique: jest.fn() },
        businessProfile: { findUnique: jest.fn() },
    };
    return { prisma: client };
});

const assertIncluded = jest.fn();
jest.mock("../billing/metering.service", () => ({
    planMeter: {
        assertIncluded: (...args: unknown[]) =>
            assertIncluded(...args) as unknown,
        isIncluded: jest.fn().mockResolvedValue(true),
    },
}));
// The controller is called as a class: its guards are the gate spec's.
jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class {},
}));
jest.mock("../../common/guards/organization.guard", () => ({
    OrganizationGuard: class {},
}));
jest.mock("../capabilities/module-enforcement.guard", () => ({
    ModuleEnforcementGuard: class {},
}));
jest.mock("./module-pages", () => ({ modulePageState: jest.fn() }));
jest.mock("./sells-from", () => ({ effectiveStorefront: jest.fn() }));

import { crc32, deflateSync, inflateSync } from "node:zlib";

import {
    ConflictException,
    ForbiddenException,
    Logger,
    NotFoundException,
    StreamableFile,
} from "@nestjs/common";
import { prisma } from "@saroh/database";
import type { Response } from "express";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { MediaService } from "../media/media.service";
import { QrCodesController } from "./qr-codes.controller";
import { QrCodesService } from "./qr-codes.service";
import * as print from "./qr-print";
import {
    BLEED_MM,
    MM,
    QR_PRINT_FORMATS,
    QR_PRINT_SPECS,
    qrPrintCodeBox,
    qrPrintFileName,
    qrPrintPage,
    QrPrintUnencodable,
    renderQrPrint,
} from "./qr-print";
import { qrPrintArt } from "./qr-print-art";
import { QR_PRINT_LOGO_HEADER, QrPrintService } from "./qr-print.service";

type Mocks<K extends string> = Record<K, jest.Mock>;
const db = prisma as unknown as {
    site: Mocks<"findFirst">;
    qrCode: Mocks<"findFirst">;
    organization: Mocks<"findUnique">;
    businessProfile: Mocks<"findUnique">;
};

const LINK = "https://glow.saroh.app/q/h7c";

// ── Reading a PDF back ──────────────────────────────────────────────────

function numbers(pdf: Buffer, box: string): number[] {
    const m = new RegExp(`/${box} \\[([^\\]]+)\\]`).exec(
        pdf.toString("latin1"),
    );
    if (!m?.[1]) throw new Error(`no ${box}`);
    return m[1].trim().split(/\s+/).map(Number);
}

/** The page's drawing operators: every stream that inflates, as text. */
function content(pdf: Buffer): string {
    const text = pdf.toString("latin1");
    const out: string[] = [];
    for (const m of text.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
        try {
            out.push(
                inflateSync(Buffer.from(m[1] ?? "", "latin1")).toString(
                    "latin1",
                ),
            );
        } catch {
            // Not a deflated stream (an image's own data): not drawing.
        }
    }
    return out.join("\n");
}

const count = (text: string, op: RegExp) => (text.match(op) ?? []).length;
const hasImage = (pdf: Buffer) =>
    pdf.toString("latin1").includes("/Subtype /Image");

// ── Logos ───────────────────────────────────────────────────────────────

function chunk(type: string, data: Buffer): Buffer {
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
}

/** An 8×8 RGB PNG; `idat` overrides its pixel data to break it. */
function png(idat?: Buffer): Buffer {
    const size = 8;
    const raw = Buffer.alloc(size * (1 + size * 3), 0x80);
    for (let y = 0; y < size; y++) raw[y * (1 + size * 3)] = 0;
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0);
    ihdr.writeUInt32BE(size, 4);
    ihdr[8] = 8;
    ihdr[9] = 2;
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk("IHDR", ihdr),
        chunk("IDAT", idat ?? deflateSync(raw)),
        chunk("IEND", Buffer.alloc(0)),
    ]);
}

/** A 4×4 WebP: Settings takes it, pdfkit cannot print it. */
const WEBP = Buffer.from(
    "UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoEAAQAAUAmJaQAA3AA/v0gUAA=",
    "base64",
);

const base = {
    link: LINK,
    code: "h7c",
    style: "PLAIN" as const,
    color: "#7a2e1d",
    label: "Scan to book",
    businessName: "Glow Studio",
};

let warn: jest.SpyInstance;
beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
});
afterEach(() => {
    warn.mockRestore();
});

describe("renderQrPrint: the page", () => {
    it.each([
        ["standee", 148, 210],
        ["tent", 100, 140],
        ["sticker", 60, 60],
        ["card", 89, 51],
    ] as const)(
        "draws the %s at %i × %i mm plus the bleed, with its trim box",
        async (format, width, height) => {
            const { file } = await renderQrPrint({ ...base, format });
            expect(file.subarray(0, 5).toString("latin1")).toBe("%PDF-");

            const pt = (mm: number) => (mm * 72) / 25.4;
            const [x0, y0, w, h] = numbers(file, "MediaBox");
            expect([x0, y0]).toEqual([0, 0]);
            expect(w).toBeCloseTo(pt(width + 6), 1);
            expect(h).toBeCloseTo(pt(height + 6), 1);
            expect(qrPrintPage(format).width).toBeCloseTo(pt(width + 6), 6);

            const trim = numbers(file, "TrimBox");
            [pt(3), pt(3), pt(width + 3), pt(height + 3)].forEach((v, i) =>
                expect(trim[i]).toBeCloseTo(v, 1),
            );
            expect(numbers(file, "BleedBox")[2]).toBeCloseTo(w, 1);
            // One page.
            expect(count(file.toString("latin1"), /\/Type \/Page\b/g)).toBe(1);
        },
    );

    it("draws eight crop marks, and the sticker's cut line too", async () => {
        const strokes = async (format: print.QrPrintFormat) =>
            count(
                content((await renderQrPrint({ ...base, format })).file),
                /\bS\n/g,
            );
        expect(await strokes("standee")).toBe(8);
        expect(await strokes("card")).toBe(8);
        expect(await strokes("sticker")).toBe(9);
    });

    it("keeps the crop marks in the bleed, short of the trim", () => {
        expect(print.MARK_GAP_MM).toBeGreaterThan(0);
        expect(print.MARK_GAP_MM).toBeLessThan(BLEED_MM);
        expect(MM).toBeCloseTo(2.8346, 4);
    });

    it("keeps the code, quiet zone and all, inside the safe margin of every format", () => {
        for (const format of QR_PRINT_FORMATS) {
            const spec = QR_PRINT_SPECS[format];
            const box = qrPrintCodeBox(format);
            expect(box.x).toBeGreaterThanOrEqual(spec.safe);
            expect(box.x + box.size).toBeLessThanOrEqual(
                spec.trim.width - spec.safe,
            );
            expect(box.size).toBeLessThanOrEqual(
                spec.trim.height - spec.safe * 2,
            );
        }
    });

    it("keeps the sticker's code and its quiet zone inside the circle", () => {
        const spec = QR_PRINT_SPECS.sticker;
        const box = qrPrintCodeBox("sticker");
        const centre = spec.trim.width / 2;
        const radius = spec.trim.width / 2 - spec.safe;
        expect(box.y).not.toBeNull();
        for (const x of [box.x, box.x + box.size]) {
            for (const y of [box.y ?? 0, (box.y ?? 0) + box.size]) {
                expect(Math.hypot(x - centre, y - centre)).toBeLessThan(radius);
            }
        }
    });

    it("carries no Saroh name: the business made it", async () => {
        const { file } = await renderQrPrint({ ...base, format: "card" });
        expect(file.toString("latin1")).not.toMatch(/saroh(?!\.app)/i);
        expect(content(file)).not.toMatch(/saroh/i);
    });
});

describe("renderQrPrint: the code", () => {
    it("draws a plain code as vector squares, with no image", async () => {
        const art = qrPrintArt(LINK);
        const { file, logo } = await renderQrPrint({
            ...base,
            format: "standee",
        });
        expect(logo).toBe("none");
        expect(hasImage(file)).toBe(false);
        // One closed subpath per mark: the dots, then the eyes' squares.
        const marks = art.dots.split("M").length + art.eyes.split("M").length;
        expect(count(content(file), /\bh\n/g)).toBeGreaterThanOrEqual(
            marks - 2,
        );
    });

    it("draws a branded code as vector dots with initials on the tile, with no image", async () => {
        const art = qrPrintArt(LINK, { style: "branded", logo: true });
        const { file, logo } = await renderQrPrint({
            ...base,
            style: "BRANDED",
            format: "tent",
        });
        expect(logo).toBe("initials");
        expect(hasImage(file)).toBe(false);
        // A dot is two arcs, each at least one curve.
        const dots = art.dots.split("M").length - 1;
        expect(count(content(file), / c\n/g)).toBeGreaterThanOrEqual(dots * 2);
    });

    it("draws the business logo in a branded code when it is a PNG", async () => {
        const { file, logo } = await renderQrPrint({
            ...base,
            style: "BRANDED",
            format: "sticker",
            logo: png(),
        });
        expect(logo).toBe("image");
        expect(hasImage(file)).toBe(true);
    });

    it("leaves a plain code without the logo: it has no box", async () => {
        const { file, logo } = await renderQrPrint({
            ...base,
            format: "card",
            logo: png(),
        });
        expect(logo).toBe("none");
        expect(hasImage(file)).toBe(false);
    });

    it("falls back to initials for a logo whose data is broken, and says so", async () => {
        const { file, logo } = await renderQrPrint({
            ...base,
            style: "BRANDED",
            format: "card",
            // A PNG by its signature, with no pixels: nothing to draw.
            logo: Buffer.concat([
                Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
                Buffer.from("not a png at all"),
            ]),
            organizationId: "org_1",
        });
        expect(logo).toBe("initials");
        expect(hasImage(file)).toBe(false);
        expect(warn).toHaveBeenCalledWith(
            expect.stringMatching(
                /^qr_print_logo_skipped: .*organization org_1, reason undecodable/,
            ),
        );
    });

    it("draws a file with no label, a very long name, and a name the font cannot draw", async () => {
        for (const over of [
            { label: null },
            {
                businessName:
                    "Shree Lakshmi Narayan Beauty Parlour & Bridal Studio",
                label: "Scan for this week's offers and bookings",
            },
            { businessName: "Supercalifragilisticexpialidocious".repeat(2) },
        ]) {
            for (const format of QR_PRINT_FORMATS) {
                const { file } = await renderQrPrint({
                    ...base,
                    ...over,
                    format,
                });
                expect(numbers(file, "MediaBox")[2]).toBeCloseTo(
                    qrPrintPage(format).width,
                    1,
                );
                expect(count(file.toString("latin1"), /\/Type \/Page\b/g)).toBe(
                    1,
                );
            }
        }
        expect(warn).not.toHaveBeenCalled();

        await renderQrPrint({
            ...base,
            format: "standee",
            businessName: "ग्लो स्टूडियो",
            organizationId: "org_1",
        });
        expect(warn).toHaveBeenCalledWith(
            expect.stringMatching(
                /^qr_print_text_skipped: .*its name.*organization org_1/,
            ),
        );
    });

    it("refuses a link no QR can hold", () => {
        expect(() =>
            renderQrPrint({
                ...base,
                format: "card",
                link: "x".repeat(4000),
            }),
        ).toThrow(QrPrintUnencodable);
    });
});

describe("qrPrintFileName", () => {
    it("names the file for the business, the code and the format", () => {
        expect(qrPrintFileName("Glow Studio", "h7c", "standee")).toBe(
            "glow-studio-qr-h7c-standee.pdf",
        );
        expect(qrPrintFileName("Café Río & Co.", "k9d", "card")).toBe(
            "cafe-rio-co-qr-k9d-card.pdf",
        );
        expect(qrPrintFileName("ग्लो", "k9d", "tent")).toBe("qr-k9d-tent.pdf");
    });
});

// ── The service ─────────────────────────────────────────────────────────

const OWNER: OrganizationContext = {
    organizationId: "org_1",
    userId: "u_1",
    role: "OWNER",
};
const SITE = "site_1";
const AT = new Date("2026-10-10T09:00:00.000Z");

function row(over: Record<string, unknown> = {}) {
    return {
        id: "qr_1",
        code: "h7c",
        targetKind: "BOOK",
        targetRef: null,
        place: "COUNTER",
        placeNote: null,
        label: "Scan to book",
        style: "PLAIN",
        color: "#7a2e1d",
        retiredAt: null,
        createdAt: AT,
        updatedAt: AT,
        ...over,
    };
}

const readReadyObjectStart = jest.fn();
const media = { readReadyObjectStart } as unknown as MediaService;
const service = new QrPrintService(new QrCodesService(), media);

async function refusal(work: Promise<unknown>) {
    const err = (await work.catch((e: unknown) => e)) as ConflictException;
    return {
        status: err.getStatus(),
        ...(err.getResponse() as {
            message?: string;
            details?: Record<string, unknown>;
        }),
    };
}

describe("QrPrintService.print", () => {
    let render: jest.SpyInstance;

    beforeEach(() => {
        jest.resetAllMocks();
        render = jest.spyOn(print, "renderQrPrint");
        db.site.findFirst.mockResolvedValue({
            id: SITE,
            organizationId: "org_1",
            subdomain: "glow",
            storefrontId: null,
            currentPublicationId: "pub_1",
        });
        db.qrCode.findFirst.mockResolvedValue(row());
        db.organization.findUnique.mockResolvedValue({ name: "Glow Studio" });
        db.businessProfile.findUnique.mockResolvedValue({
            logoUrl: "https://media.example.com/logo.png",
            logoMediaId: "media_1",
        });
        readReadyObjectStart.mockResolvedValue({
            bytes: png(),
            contentType: "image/png",
        });
        assertIncluded.mockResolvedValue(undefined);
    });
    afterEach(() => render.mockRestore());

    it("draws the code's short link on the Saroh address, in its style, colour and label", async () => {
        const out = await service.print(OWNER, SITE, "qr_1", "standee");
        expect(out.fileName).toBe("glow-studio-qr-h7c-standee.pdf");
        expect(out.logo).toBe("none");
        expect(numbers(out.file, "MediaBox")[2]).toBeCloseTo(
            (154 * 72) / 25.4,
            1,
        );
        expect(render).toHaveBeenCalledWith(
            expect.objectContaining({
                format: "standee",
                link: "https://glow.saroh.app/q/h7c",
                style: "PLAIN",
                color: "#7a2e1d",
                label: "Scan to book",
                businessName: "Glow Studio",
            }),
        );
        // The row was looked for in this business, on this site.
        expect(db.qrCode.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: "qr_1", siteId: SITE, organizationId: "org_1" },
            }),
        );
        // A plain code has no logo box, so the logo is never read.
        expect(db.businessProfile.findUnique).not.toHaveBeenCalled();
        expect(readReadyObjectStart).not.toHaveBeenCalled();
    });

    it("is part of the qr-branding row, for a plain code too, and passes the lock on", async () => {
        await service.print(OWNER, SITE, "qr_1", "card");
        expect(assertIncluded).toHaveBeenCalledWith("org_1", "qr-branding");

        assertIncluded.mockRejectedValue(
            new ForbiddenException({
                message: "QR codes in your style isn't in your Free plan.",
                details: { code: "MODULE_LOCKED", moduleId: "qr-branding" },
            }),
        );
        render.mockClear();
        const refused = await refusal(
            service.print(OWNER, SITE, "qr_1", "card"),
        );
        expect(refused.status).toBe(403);
        expect(refused.details).toMatchObject({
            code: "MODULE_LOCKED",
            moduleId: "qr-branding",
        });
        expect(render).not.toHaveBeenCalled();
    });

    it("refuses a retired code with 409 `retired`", async () => {
        db.qrCode.findFirst.mockResolvedValue(row({ retiredAt: AT }));
        const refused = await refusal(
            service.print(OWNER, SITE, "qr_1", "tent"),
        );
        expect(refused.status).toBe(409);
        expect(refused.details).toEqual({ reason: "retired" });
        expect(render).not.toHaveBeenCalled();
    });

    it("refuses a site with no Saroh address with 409 `no-address`", async () => {
        db.site.findFirst.mockResolvedValue({
            id: SITE,
            organizationId: "org_1",
            subdomain: null,
            storefrontId: null,
            currentPublicationId: null,
        });
        const refused = await refusal(
            service.print(OWNER, SITE, "qr_1", "tent"),
        );
        expect(refused.status).toBe(409);
        expect(refused.details).toEqual({ reason: "no-address" });
        expect(refused.message).toMatch(/no Saroh address/);
    });

    it("answers 404 for another business's site or code, before the plan is asked", async () => {
        db.qrCode.findFirst.mockResolvedValue(null);
        await expect(
            service.print(OWNER, SITE, "qr_other", "card"),
        ).rejects.toBeInstanceOf(NotFoundException);

        db.site.findFirst.mockResolvedValue(null);
        await expect(
            service.print(OWNER, "site_other", "qr_1", "card"),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(assertIncluded).not.toHaveBeenCalled();
        expect(render).not.toHaveBeenCalled();
    });

    it("lets a role that only reads the site download, as it may read the list", async () => {
        const reviewer = { ...OWNER, role: "REVIEWER" } as OrganizationContext;
        await expect(
            service.print(reviewer, SITE, "qr_1", "card"),
        ).resolves.toMatchObject({ logo: "none" });
    });

    describe("a branded code's logo", () => {
        beforeEach(() => {
            db.qrCode.findFirst.mockResolvedValue(row({ style: "BRANDED" }));
        });

        it("is the business logo when it is a PNG, read from this business's library", async () => {
            const out = await service.print(OWNER, SITE, "qr_1", "sticker");
            expect(out.logo).toBe("image");
            expect(hasImage(out.file)).toBe(true);
            expect(readReadyObjectStart).toHaveBeenCalledWith(
                "org_1",
                "media_1",
                expect.any(Number),
            );
            expect(warn).not.toHaveBeenCalled();
        });

        it("is initials when the business has no logo, with nothing logged", async () => {
            db.businessProfile.findUnique.mockResolvedValue({
                logoUrl: null,
                logoMediaId: null,
            });
            const out = await service.print(OWNER, SITE, "qr_1", "standee");
            expect(out.logo).toBe("initials");
            expect(hasImage(out.file)).toBe(false);
            expect(readReadyObjectStart).not.toHaveBeenCalled();
            expect(warn).not.toHaveBeenCalled();
        });

        it("is initials for a WebP logo, and the log says which paper and why", async () => {
            readReadyObjectStart.mockResolvedValue({
                bytes: WEBP,
                contentType: "image/webp",
            });
            const out = await service.print(OWNER, SITE, "qr_1", "card");
            expect(out.logo).toBe("initials");
            expect(hasImage(out.file)).toBe(false);
            expect(out.file.subarray(0, 5).toString("latin1")).toBe("%PDF-");
            expect(warn).toHaveBeenCalledWith(
                expect.stringMatching(
                    /^qr_print_logo_skipped: .*organization org_1, reason unsupported_format/,
                ),
            );
        });

        it("is initials when storage fails: the file still goes out", async () => {
            readReadyObjectStart.mockRejectedValue(new Error("storage down"));
            const out = await service.print(OWNER, SITE, "qr_1", "tent");
            expect(out.logo).toBe("initials");
            expect(warn).toHaveBeenCalledWith(
                expect.stringMatching(/reason read_failed/),
            );
        });
    });

    it("hands the controller a download: the name, no caching, and what the logo was", async () => {
        const controller = new QrCodesController(new QrCodesService(), service);
        const setHeader = jest.fn();
        const out = await controller.print(
            OWNER,
            SITE,
            "qr_1",
            { format: "card" },
            { setHeader } as unknown as Response,
        );
        expect(out).toBeInstanceOf(StreamableFile);
        expect(out.getHeaders()).toMatchObject({
            type: "application/pdf",
            disposition: 'attachment; filename="glow-studio-qr-h7c-card.pdf"',
        });
        expect(setHeader).toHaveBeenCalledWith(QR_PRINT_LOGO_HEADER, "none");
        expect(
            Reflect.getMetadata(
                "__headers__",
                // eslint-disable-next-line @typescript-eslint/unbound-method
                QrCodesController.prototype.print,
            ),
        ).toEqual([{ name: "Cache-Control", value: "private, no-store" }]);
    });
});
