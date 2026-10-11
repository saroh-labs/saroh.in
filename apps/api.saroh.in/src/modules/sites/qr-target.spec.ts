// DB-free tests of a QR code's short id, its colour rule, its tag and where
// it points. The database client is a hand-made stand-in.
import {
    codeOfQrSource,
    contrastOnWhite,
    newQrCode,
    normaliseQrColor,
    QR_CODE_ALPHABET,
    QR_CODE_SHAPE,
    qrCodeLength,
    qrPage,
    qrProduct,
    qrSourceCode,
    qrTargetLook,
    qrTargetPath,
    tooLightToScan,
} from "./qr-target";

const SITE = {
    id: "site_1",
    organizationId: "org_1",
    storefrontId: "store_1",
    currentPublicationId: "pub_1",
};

function db() {
    return {
        product: { findFirst: jest.fn() },
        page: { findFirst: jest.fn() },
        publication: { count: jest.fn() },
    };
}

describe("a short id", () => {
    it("is made only of characters with no look-alikes and no vowels", () => {
        expect(QR_CODE_ALPHABET).not.toMatch(/[01ilo]/);
        expect(QR_CODE_ALPHABET).not.toMatch(/[aeiou]/);
        expect(new Set(QR_CODE_ALPHABET).size).toBe(QR_CODE_ALPHABET.length);
        for (let i = 0; i < 200; i++) {
            const code = newQrCode();
            expect(code).toHaveLength(3);
            expect(code).toMatch(QR_CODE_SHAPE);
            for (const ch of code) expect(QR_CODE_ALPHABET).toContain(ch);
        }
    });

    it("draws each character from the picker", () => {
        const picks = [0, 1, QR_CODE_ALPHABET.length - 1, 9];
        let i = 0;
        expect(newQrCode(4, () => picks[i++] ?? 0)).toBe("23zc");
    });

    it("starts at three characters and grows to six as tries collide", () => {
        expect([0, 1, 2, 3, 5, 6, 8, 9, 30].map(qrCodeLength)).toEqual([
            3, 3, 3, 4, 4, 5, 5, 6, 6,
        ]);
    });
});

describe("a colour", () => {
    it("is kept as lower-case #rrggbb, and nothing else", () => {
        expect(normaliseQrColor(" #1C1C1A ")).toBe("#1c1c1a");
        for (const bad of ["1c1c1a", "#fff", "#12345g", "red", ""]) {
            expect(normaliseQrColor(bad)).toBeNull();
        }
    });

    it("is too light below 4:1 against white", () => {
        expect(contrastOnWhite("#000000")).toBeCloseTo(21, 5);
        expect(contrastOnWhite("#ffffff")).toBeCloseTo(1, 5);
        // The design's amber is refused and its ink is not.
        expect(tooLightToScan("#f0a92b")).toBe(true);
        expect(tooLightToScan("#1c1c1a")).toBe(false);
        // Either side of the line: #808080 is 3.95:1, #7f7f7f is 4.00:1.
        expect(contrastOnWhite("#808080")).toBeLessThan(4);
        expect(tooLightToScan("#808080")).toBe(true);
        expect(contrastOnWhite("#7f7f7f")).toBeGreaterThanOrEqual(4);
        expect(tooLightToScan("#7f7f7f")).toBe(false);
    });
});

describe("the tag a scan leaves", () => {
    it("names a code only when it is well formed", () => {
        expect(codeOfQrSource("qr-h7c")).toBe("h7c");
        expect(codeOfQrSource("qr-H7C")).toBe("h7c");
        for (const bad of [
            null,
            undefined,
            "",
            "h7c",
            "qr-",
            "qr-h7",
            "qr-toolong1",
            "qr-h/7",
            "ig-h7c",
        ]) {
            expect(codeOfQrSource(bad)).toBeNull();
        }
    });

    it("is stored as the code's row id, which no two sites share", () => {
        expect(qrSourceCode({ id: "qr_row_1" })).toBe("qr_row_1");
    });
});

describe("where a code points", () => {
    it("opens the site's own pages without asking the database", async () => {
        const d = db();
        for (const [targetKind, path] of [
            ["SITE", "/"],
            ["SHOP", "/shop"],
            ["BOOK", "/book"],
        ] as const) {
            expect(
                await qrTargetPath(d as never, SITE, {
                    targetKind,
                    targetRef: null,
                }),
            ).toBe(path);
        }
        expect(d.product.findFirst).not.toHaveBeenCalled();
        expect(d.page.findFirst).not.toHaveBeenCalled();
    });

    it("opens a product at its address now, if it is still sold here", async () => {
        const d = db();
        d.product.findFirst.mockResolvedValue({
            id: "prod_1",
            name: "Rye loaf",
            slug: "rye loaf",
        });
        expect(
            await qrTargetLook(d as never, SITE, {
                targetKind: "PRODUCT",
                targetRef: "prod_1",
            }),
        ).toEqual({ name: "Rye loaf", path: "/shop/rye%20loaf" });
        expect(d.product.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    id: "prod_1",
                    organizationId: "org_1",
                    status: "PUBLISHED",
                    listings: {
                        some: {
                            storeId: "store_1",
                            store: { deletedAt: null },
                        },
                    },
                },
            }),
        );
    });

    it("has nowhere to go for a product that is gone, or a site that sells nowhere", async () => {
        const d = db();
        d.product.findFirst.mockResolvedValue(null);
        const gone = { targetKind: "PRODUCT", targetRef: "prod_1" };
        expect(await qrTargetPath(d as never, SITE, gone)).toBeNull();
        expect(
            await qrProduct(
                d as never,
                { ...SITE, storefrontId: null },
                "prod_1",
            ),
        ).toBeNull();
        expect(d.product.findFirst).toHaveBeenCalledTimes(1);
    });

    it("opens a page at its address when the published site holds it", async () => {
        const d = db();
        d.page.findFirst.mockResolvedValue({
            id: "page_1",
            title: "Menu",
            path: "/menu/",
        });
        d.publication.count.mockResolvedValue(1);
        expect(
            await qrTargetLook(d as never, SITE, {
                targetKind: "PAGE",
                targetRef: "page_1",
            }),
        ).toEqual({ name: "Menu", path: "/menu" });
        expect(d.page.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    id: "page_1",
                    siteId: "site_1",
                    organizationId: "org_1",
                    kind: "FREE",
                    hidden: false,
                },
            }),
        );
        expect(d.publication.count).toHaveBeenCalledWith({
            where: {
                id: "pub_1",
                siteId: "site_1",
                snapshot: {
                    path: ["pages"],
                    array_contains: [{ path: "/menu" }],
                },
            },
        });
    });

    it("has nowhere to go for a page that isn't published, hidden or gone", async () => {
        const d = db();
        const page = { targetKind: "PAGE", targetRef: "page_1" };
        // Moved in the draft and not published since.
        d.page.findFirst.mockResolvedValue({
            id: "page_1",
            title: "Menu",
            path: "/menu",
        });
        d.publication.count.mockResolvedValue(0);
        expect(await qrTargetPath(d as never, SITE, page)).toBeNull();
        // Hidden, deleted, a module page, or another site's.
        d.page.findFirst.mockResolvedValue(null);
        expect(await qrTargetPath(d as never, SITE, page)).toBeNull();
        // A site that was never published holds no page.
        expect(
            await qrPage(
                d as never,
                { ...SITE, currentPublicationId: null },
                "page_1",
            ),
        ).toBeNull();
    });

    it("has nowhere to go for a kind it doesn't know", async () => {
        expect(
            await qrTargetPath(db() as never, SITE, {
                targetKind: "OFFER",
                targetRef: null,
            }),
        ).toBeNull();
    });
});
