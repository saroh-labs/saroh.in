import { createCipheriv, randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { RazorpayConnection } from "./razorpay-public-keys";
import { planRazorpayPublicKey } from "./razorpay-public-keys";
import { openerFor, paymentsKey } from "./sealed-credentials";

const HEX_KEY = "ab".repeat(32);

/** Seal the way the API's payments/crypto.ts does. */
function seal(plaintext: string, key = Buffer.from(HEX_KEY, "hex")) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([
        cipher.update(plaintext, "utf8"),
        cipher.final(),
    ]);
    return {
        ciphertext: ciphertext.toString("base64"),
        iv: iv.toString("base64"),
        authTag: cipher.getAuthTag().toString("base64"),
    };
}

const open = openerFor(paymentsKey(HEX_KEY));

function row(
    publicKey: string | null,
    blob: string = JSON.stringify({
        keyId: "rzp_live_AbC123",
        keySecret: "super-secret-value",
    }),
): RazorpayConnection {
    return { id: "mpp_1", publicKey, sealed: seal(blob) };
}

describe("Razorpay connections get their public key id (D22)", () => {
    it("fills an empty public key from the sealed key id", () => {
        expect(planRazorpayPublicKey(row(null), open)).toEqual({
            kind: "set",
            publicKey: "rzp_live_AbC123",
        });
        expect(planRazorpayPublicKey(row(""), open)).toEqual({
            kind: "set",
            publicKey: "rzp_live_AbC123",
        });
    });

    it("corrects a different code typed into the old optional field", () => {
        expect(planRazorpayPublicKey(row("rzp_live_Typo"), open)).toEqual({
            kind: "set",
            publicKey: "rzp_live_AbC123",
        });
    });

    it("leaves one that already holds its key id, so a second run writes nothing", () => {
        expect(planRazorpayPublicKey(row("rzp_live_AbC123"), open)).toEqual({
            kind: "same",
        });
    });

    it("trims the sealed key id", () => {
        const plan = planRazorpayPublicKey(
            row(
                null,
                JSON.stringify({ keyId: " rzp_test_X1 ", keySecret: "s" }),
            ),
            open,
        );
        expect(plan).toEqual({ kind: "set", publicKey: "rzp_test_X1" });
    });

    it("counts a blob it can't open, or one with no key id, as unreadable", () => {
        const tampered = row(null);
        tampered.sealed.authTag = Buffer.alloc(16).toString("base64");
        expect(planRazorpayPublicKey(tampered, open)).toEqual({
            kind: "unreadable",
        });
        const otherKey = {
            ...row(null),
            sealed: seal(
                JSON.stringify({ keyId: "rzp_live_AbC123" }),
                randomBytes(32),
            ),
        };
        expect(planRazorpayPublicKey(otherKey, open)).toEqual({
            kind: "unreadable",
        });
        expect(
            planRazorpayPublicKey(
                row(null, JSON.stringify({ keySecret: "s" })),
                open,
            ),
        ).toEqual({ kind: "unreadable" });
        expect(planRazorpayPublicKey(row(null, "not json"), open)).toEqual({
            kind: "unreadable",
        });
    });

    it("never puts the secret in what it plans", () => {
        expect(
            JSON.stringify(planRazorpayPublicKey(row(null), open)),
        ).not.toContain("super-secret-value");
    });
});

describe("PAYMENTS_ENC_KEY, as the backfill reads it", () => {
    it("takes 64 hex characters or base64 of 32 bytes", () => {
        expect(paymentsKey(HEX_KEY)).toHaveLength(32);
        expect(
            paymentsKey(Buffer.from(HEX_KEY, "hex").toString("base64")),
        ).toEqual(Buffer.from(HEX_KEY, "hex"));
    });

    it("refuses a missing or short key without echoing it", () => {
        expect(() => paymentsKey(undefined)).toThrow(/not set/);
        expect(() => paymentsKey("c2hvcnQ=")).toThrow(/32 bytes/);
        expect(() => paymentsKey("c2hvcnQ=")).not.toThrow(/c2hvcnQ/);
    });
});
