// DB-free, network-free unit tests for the AES-256-GCM credential crypto.
// The env module is mocked so we control PAYMENTS_ENC_KEY without validating
// the real app env (DATABASE_URL etc.). The key is read AT USE time, so a test
// can null it out to exercise the missing-key failure.
jest.mock("../../env", () => ({
    env: {
        // A deterministic 32-byte key as 64 hex chars.
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    },
}));

import { env } from "../../env";
import { decryptSecret, encryptSecret } from "./crypto";

const mutableEnv = env as { PAYMENTS_ENC_KEY?: string };
const VALID_HEX_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("payments crypto", () => {
    beforeEach(() => {
        mutableEnv.PAYMENTS_ENC_KEY = VALID_HEX_KEY;
    });

    it("round-trips: decrypt(encrypt(x)) === x", () => {
        const plaintext = JSON.stringify({
            keyId: "rzp_key_123",
            keySecret: "super-secret-value",
        });

        const sealed = encryptSecret(plaintext);
        expect(decryptSecret(sealed)).toBe(plaintext);
    });

    it("produces ciphertext that differs from the plaintext", () => {
        const plaintext = "super-secret-value";
        const sealed = encryptSecret(plaintext);

        // Base64 ciphertext must not simply be the plaintext (or its base64).
        expect(sealed.ciphertext).not.toBe(plaintext);
        expect(
            Buffer.from(sealed.ciphertext, "base64").toString("utf8"),
        ).not.toBe(plaintext);
        // A fresh random iv each time → non-empty iv + tag.
        expect(sealed.iv.length).toBeGreaterThan(0);
        expect(sealed.authTag.length).toBeGreaterThan(0);
    });

    it("uses a fresh iv per call (same plaintext → different ciphertext)", () => {
        const a = encryptSecret("same");
        const b = encryptSecret("same");
        expect(a.iv).not.toBe(b.iv);
        expect(a.ciphertext).not.toBe(b.ciphertext);
    });

    it("accepts a base64-encoded 32-byte key too", () => {
        mutableEnv.PAYMENTS_ENC_KEY = Buffer.alloc(32, 7).toString("base64");
        const sealed = encryptSecret("hello");
        expect(decryptSecret(sealed)).toBe("hello");
    });

    it("THROWS when the ciphertext is tampered with", () => {
        const sealed = encryptSecret("secret");
        const tamperedBytes = Buffer.from(sealed.ciphertext, "base64");
        tamperedBytes[0] ^= 0xff; // flip a bit
        const tampered = {
            ...sealed,
            ciphertext: tamperedBytes.toString("base64"),
        };
        expect(() => decryptSecret(tampered)).toThrow();
    });

    it("THROWS when the auth tag is tampered with", () => {
        const sealed = encryptSecret("secret");
        const tamperedTag = Buffer.from(sealed.authTag, "base64");
        tamperedTag[0] ^= 0xff;
        const tampered = { ...sealed, authTag: tamperedTag.toString("base64") };
        expect(() => decryptSecret(tampered)).toThrow();
    });

    it("THROWS a clear error when the key is missing", () => {
        mutableEnv.PAYMENTS_ENC_KEY = undefined;
        expect(() => encryptSecret("x")).toThrow(/PAYMENTS_ENC_KEY is not set/);
    });

    it("THROWS a clear error when the key is the wrong length", () => {
        mutableEnv.PAYMENTS_ENC_KEY = "too-short";
        expect(() => encryptSecret("x")).toThrow(/must decode to 32 bytes/);
    });
});
