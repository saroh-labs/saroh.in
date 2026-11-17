import { createDecipheriv } from "node:crypto";

import { describe, expect, it } from "vitest";

import { endOfLocalDay, sealForRow } from "./ask-ai-conversations";

const KEY = "ab".repeat(32);

/** `decryptWithKey` in the API's `common/crypto.ts`, for one hex key. */
function open(sealed: { ciphertext: string; iv: string; authTag: string }) {
    const [, body = sealed.ciphertext] =
        /^[a-z0-9]{1,16}:(.*)$/.exec(sealed.ciphertext) ?? [];
    const d = createDecipheriv(
        "aes-256-gcm",
        Buffer.from(KEY, "hex"),
        Buffer.from(sealed.iv, "base64"),
    );
    d.setAuthTag(Buffer.from(sealed.authTag, "base64"));
    return JSON.parse(
        Buffer.concat([
            d.update(Buffer.from(body, "base64")),
            d.final(),
        ]).toString("utf8"),
    ) as unknown;
}

describe("seeded Ask AI text", () => {
    it("seals the API's envelope, bound to its row", () => {
        const b = { o: "org", c: "conv", r: "msg", f: "body" as const };
        const ring = { id: "v1", key: Buffer.from(KEY, "hex") };
        expect(open(sealForRow(ring, "hello", b))).toEqual({
            ...b,
            t: "hello",
        });
    });

    it("tags a ring key's id, as the API does", () => {
        const ring = { id: "v2", key: Buffer.from(KEY, "hex") };
        const sealed = sealForRow(ring, "x", {
            o: "o",
            c: "c",
            r: "r",
            f: "title",
        });
        expect(sealed.ciphertext.startsWith("v2:")).toBe(true);
        expect(open(sealed)).toMatchObject({ t: "x" });
    });

    it("ends a draft's day at local midnight", () => {
        const now = new Date("2026-11-16T10:00:00Z");
        expect(endOfLocalDay(now, "Asia/Kolkata").toISOString()).toBe(
            "2026-11-16T18:29:59.999Z",
        );
        expect(endOfLocalDay(now, "America/New_York").toISOString()).toBe(
            "2026-11-17T04:59:59.999Z",
        );
    });
});
