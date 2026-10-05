/**
 * The pay link's "Download PDF" over HTTP (DEC-083), the database mocked:
 * the token alone names the invoice; a good one answers the PDF as a
 * private, unsniffed attachment named for its number; a bad, replaced,
 * void or draft one is a 404; and callers and drawings are both limited.
 */
jest.mock("../../env", () => ({ env: { NODE_ENV: "test" } }));

jest.mock("@saroh/database", () => ({
    prisma: { invoice: { findUnique: jest.fn() } },
    runInOrgContext: (_org: string, fn: () => unknown) => fn(),
}));

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { prisma } from "@saroh/database";

import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import type { IssuedInvoicePdf } from "../invoices/issued-invoice-pdf";
import { hashPayToken } from "../invoices/pay-token";
import { PublicInvoicePdfService } from "./public-invoice-pdf.service";
import { PublicInvoicesController } from "./public-invoices.controller";
import { PublicInvoicesService } from "./public-invoices.service";

const findUnique = prisma.invoice.findUnique as jest.Mock;
const PDF = Buffer.from("%PDF-1.7 the paper");
const draw = jest.fn();
const drawer = { draw } as unknown as IssuedInvoicePdf;

let app: INestApplication;
let url: string;

beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
        controllers: [PublicInvoicesController],
        providers: [
            { provide: PublicInvoicesService, useValue: {} },
            {
                provide: PublicInvoicePdfService,
                useFactory: () => new PublicInvoicePdfService(drawer),
            },
        ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.listen(0, "127.0.0.1");
    url = await app.getUrl();
});

afterAll(async () => {
    await app?.close();
});

beforeEach(() => {
    jest.clearAllMocks();
    findUnique.mockImplementation(
        ({ where }: { where: { payTokenHash: string } }) =>
            Promise.resolve(
                where.payTokenHash === hashPayToken("tok_live")
                    ? { id: "inv_1", organizationId: "org_rye" }
                    : null,
            ),
    );
    draw.mockResolvedValue({ file: PDF, fileName: "KD-26-27-0012.pdf" });
});

describe("GET /public/invoices/:token/pdf (DEC-083)", () => {
    it("a live link: the PDF, an attachment named for its number, private and unsniffed", async () => {
        const res = await fetch(`${url}/public/invoices/tok_live/pdf`);
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toBe("application/pdf");
        expect(res.headers.get("content-disposition")).toBe(
            'attachment; filename="KD-26-27-0012.pdf"',
        );
        expect(res.headers.get("cache-control")).toBe("private, no-store");
        expect(res.headers.get("x-content-type-options")).toBe("nosniff");
        expect(res.headers.get("referrer-policy")).toBe("no-referrer");
        expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
        expect(Buffer.from(await res.arrayBuffer())).toEqual(PDF);
        // The token's own invoice, in its own business: nothing else sent
        // with the request is read.
        expect(findUnique).toHaveBeenCalledWith({
            where: { payTokenHash: hashPayToken("tok_live") },
            select: { id: true, organizationId: true },
        });
        expect(draw).toHaveBeenCalledWith("org_rye", "inv_1");
    });

    it("an unknown or replaced link is a 404, and nothing is drawn", async () => {
        const res = await fetch(`${url}/public/invoices/tok_replaced/pdf`);
        expect(res.status).toBe(404);
        expect(draw).not.toHaveBeenCalled();
    });

    it("a void invoice or a draft (no paper) is a 404", async () => {
        draw.mockResolvedValue(null);
        const res = await fetch(`${url}/public/invoices/tok_live/pdf`);
        expect(res.status).toBe(404);
    });
});

describe("its limits", () => {
    it("draws one invoice at most 10 times in ten minutes, whoever asks", async () => {
        const service = new PublicInvoicePdfService(drawer);
        for (let i = 0; i < 10; i++) {
            await service.pdf("tok_live", `caller_${i}`);
        }
        await expect(
            service.pdf("tok_live", "caller_new"),
        ).rejects.toMatchObject({ status: 429 });
        expect(draw).toHaveBeenCalledTimes(10);
    });

    it("stops one caller guessing tokens, before any lookup", async () => {
        const service = new PublicInvoicePdfService(
            drawer,
            new FixedWindowRateLimiter(2, 60_000),
        );
        for (let i = 0; i < 2; i++) {
            await service.pdf(`guess_${i}`, "caller_x").catch(() => undefined);
        }
        await expect(service.pdf("guess_9", "caller_x")).rejects.toMatchObject({
            status: 429,
        });
        expect(findUnique).toHaveBeenCalledTimes(2);
    });
});
