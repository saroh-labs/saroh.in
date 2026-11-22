import { describe, expect, it } from "vitest";

import { assertTenantKey } from "./keys";
import { IMAGE_END_BYTES, imageEndsCleanly } from "./validation";

const bytes = (...parts: (number[] | string)[]) =>
    Uint8Array.from(
        parts.flatMap((p) =>
            typeof p === "string" ? Array.from(p, (c) => c.charCodeAt(0)) : p,
        ),
    );

/** A tiny file of each format, whole: the ends are what matter. */
const JPEG = bytes(
    [0xff, 0xd8, 0xff, 0xe0],
    new Array(20).fill(0),
    [0xff, 0xd9],
);
const PNG = bytes(
    [0x89],
    "PNG",
    [0x0d, 0x0a, 0x1a, 0x0a],
    new Array(13).fill(1),
    [0, 0, 0, 0],
    "IEND",
    [0xae, 0x42, 0x60, 0x82],
);
const GIF = bytes("GIF89a", new Array(20).fill(2), [0x3b]);
function webp(payload: number): Uint8Array {
    const out = new Uint8Array(12 + payload);
    out.set(bytes("RIFF"), 0);
    new DataView(out.buffer).setUint32(4, 4 + payload, true);
    out.set(bytes("WEBP"), 8);
    return out;
}
const WEBP = webp(30);

/** The polyglot trick: a zip's header and bytes after the picture ends. */
const APPENDED = bytes("PK", [3, 4], "hidden.html");

function check(type: string, file: Uint8Array): boolean {
    return imageEndsCleanly(
        type,
        file.subarray(0, 12),
        file.subarray(Math.max(0, file.length - IMAGE_END_BYTES)),
        file.length,
    );
}

const join = (a: Uint8Array, b: Uint8Array) => {
    const out = new Uint8Array(a.length + b.length);
    out.set(a);
    out.set(b, a.length);
    return out;
};

describe("a stored image ends where its format ends (DEC-246)", () => {
    it.each([
        ["image/jpeg", JPEG],
        ["image/png", PNG],
        ["image/gif", GIF],
        ["image/webp", WEBP],
    ])("accepts a whole %s", (type, file) => {
        expect(check(type, file)).toBe(true);
    });

    it.each([
        ["image/jpeg", JPEG],
        ["image/png", PNG],
        ["image/gif", GIF],
        ["image/webp", WEBP],
    ])("refuses a %s with bytes appended", (type, file) => {
        expect(check(type, join(file, APPENDED))).toBe(false);
        expect(check(type, join(file, bytes([0])))).toBe(false);
    });

    it("refuses a WebP cut short", () => {
        expect(check("image/webp", WEBP.subarray(0, WEBP.length - 1))).toBe(
            false,
        );
    });

    it("leaves AVIF and video to their first-bytes check", () => {
        expect(check("image/avif", APPENDED)).toBe(true);
        expect(check("video/mp4", APPENDED)).toBe(true);
    });
});

describe("a server-made key", () => {
    it("must sit under the organization's prefix", () => {
        expect(
            assertTenantKey("org_1", "org/org-1/site-image/u-p@480.webp"),
        ).toBe("org/org-1/site-image/u-p@480.webp");
        expect(() => assertTenantKey("org_1", "org/org-2/x.webp")).toThrow();
        expect(() =>
            assertTenantKey("org_1", "org/org-1/../org-2/x"),
        ).toThrow();
        expect(() => assertTenantKey("org_1", "org/org-1/a b.webp")).toThrow();
    });
});
