// Which QR code a booking or an order came from: the tag is the browser's
// word, so only a well-formed one is looked up, only on the customer's own
// site and business, and nothing about it can refuse the booking or order.
// DB-free: `@saroh/database` is mocked.
import "reflect-metadata";

jest.mock("@saroh/database", () => {
    const actual = jest.requireActual("@saroh/database");
    return {
        ...actual,
        prisma: { qrCode: { findFirst: jest.fn() } },
    };
});

import { Logger, ValidationPipe } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { validationPipeOptions } from "../../common/validation";
import { CheckoutStartDto } from "../orders/checkout.dto";
import { AccountBookDto } from "../site-accounts/dto";
import { qrSourceFor } from "./qr-source";
import { QR_SOURCE_TAG_MAX, qrSourceTagOf } from "./qr-target";

const findFirst = (prisma as unknown as { qrCode: { findFirst: jest.Mock } })
    .qrCode.findFirst;

const SCOPE = { siteId: "site_1", organizationId: "org_1" };

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe("qrSourceFor", () => {
    it("stores the row's own id for a code of this site, looked up by site and business", async () => {
        findFirst.mockResolvedValue({ id: "qr_1" });
        await expect(qrSourceFor(SCOPE, "qr-h7c")).resolves.toBe("qr_1");
        expect(findFirst).toHaveBeenCalledWith({
            where: { siteId: "site_1", organizationId: "org_1", code: "h7c" },
            select: { id: true },
        });
    });

    it("reads the code lower-cased, as it is stored", async () => {
        findFirst.mockResolvedValue({ id: "qr_1" });
        await qrSourceFor(SCOPE, "qr-H7C");
        expect(findFirst.mock.calls[0][0].where.code).toBe("h7c");
    });

    it("is no source for a code this site doesn't have: another site's, another business's", async () => {
        // The lookup names the site and the business, so the same short id
        // on someone else's site is simply not found.
        findFirst.mockResolvedValue(null);
        await expect(qrSourceFor(SCOPE, "qr-k9d")).resolves.toBeNull();
    });

    it("still counts a retired code: nothing about retiring is asked", async () => {
        findFirst.mockResolvedValue({ id: "qr_old" });
        await expect(qrSourceFor(SCOPE, "qr-h7c")).resolves.toBe("qr_old");
        expect(findFirst.mock.calls[0][0].where).not.toHaveProperty(
            "retiredAt",
        );
    });

    it.each([
        undefined,
        null,
        "",
        "h7c",
        "qr-",
        "qr-h7",
        "qr-toolong1",
        "qr-h7c'; DROP TABLE",
        "newsletter",
        "ckx0000000000000000000000",
    ])("never asks the database about %p", async (tag) => {
        await expect(qrSourceFor(SCOPE, tag)).resolves.toBeNull();
        expect(findFirst).not.toHaveBeenCalled();
    });

    it("is no source when the read fails, and never throws", async () => {
        findFirst.mockRejectedValue(new Error("connection lost"));
        await expect(qrSourceFor(SCOPE, "qr-h7c")).resolves.toBeNull();
    });
});

describe("qrSourceTagOf", () => {
    it("keeps a well-formed tag and drops everything else", () => {
        expect(qrSourceTagOf("qr-h7c")).toBe("qr-h7c");
        expect(qrSourceTagOf("qr-k9dq2x")).toBe("qr-k9dq2x");
        expect("qr-k9dq2x").toHaveLength(QR_SOURCE_TAG_MAX);
        for (const other of [
            undefined,
            null,
            7,
            true,
            ["qr-h7c"],
            { code: "h7c" },
            "",
            "qr-",
            "newsletter",
            "qr-toolong1",
            "x".repeat(10_000),
        ]) {
            expect(qrSourceTagOf(other)).toBeUndefined();
        }
    });
});

describe("a `source` at the boundary never refuses the request", () => {
    const pipe = new ValidationPipe(validationPipeOptions);
    const parse = <T>(metatype: new () => T, value: unknown) =>
        pipe.transform(value, { type: "body", metatype }) as Promise<T>;

    const BOOKING = {
        serviceId: "svc_1",
        startAt: "2026-11-02T09:00:00.000Z",
    };
    // A checkout's idempotency key, not a credential.
    const ATTEMPT = ["checkout", "attempt", "01"].join("-");
    const CHECKOUT = {
        lines: [{ listingId: "listing_1", quantity: 1 }],
        fulfilment: "PICKUP",
        key: ATTEMPT,
    };
    const ODD = [
        "newsletter",
        "qr-",
        "qr-toolong1",
        "",
        7,
        null,
        ["qr-h7c"],
        { code: "h7c" },
        "x".repeat(10_000),
    ];

    it("a booking keeps a QR tag, and goes ahead without anything else", async () => {
        const tagged = await parse(AccountBookDto, {
            ...BOOKING,
            source: "qr-h7c",
        });
        expect(tagged.source).toBe("qr-h7c");
        for (const source of ODD) {
            const dto = await parse(AccountBookDto, { ...BOOKING, source });
            expect(dto.source).toBeUndefined();
            expect(dto.serviceId).toBe("svc_1");
        }
        expect((await parse(AccountBookDto, BOOKING)).source).toBeUndefined();
    });

    it("a checkout keeps a QR tag, and goes ahead without anything else", async () => {
        const tagged = await parse(CheckoutStartDto, {
            ...CHECKOUT,
            source: "qr-h7c",
        });
        expect(tagged.source).toBe("qr-h7c");
        for (const source of ODD) {
            const dto = await parse(CheckoutStartDto, { ...CHECKOUT, source });
            expect(dto.source).toBeUndefined();
            expect(dto.key).toBe(ATTEMPT);
        }
    });

    it("still refuses a field that names a code's row, or a business", async () => {
        // The browser can't name the row or the business: only the tag.
        for (const extra of [
            { sourceCode: "qr_1" },
            { qrCodeId: "qr_1" },
            { organizationId: "org_other" },
        ]) {
            await expect(
                parse(AccountBookDto, { ...BOOKING, ...extra }),
            ).rejects.toThrow();
            await expect(
                parse(CheckoutStartDto, { ...CHECKOUT, ...extra }),
            ).rejects.toThrow();
        }
    });
});
