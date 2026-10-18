// DB-free, network-free unit tests for the shared AES-256-GCM sealing. The
// key is a parameter, so two keys can be told apart without touching env.
import type { EncryptionKey } from "./crypto";
import { decryptWithKey, encryptWithKey, keyedDigest } from "./crypto";

const key = (
    value: string | undefined,
    name = "TEST_ENC_KEY",
): EncryptionKey => ({
    name,
    value,
    protects: "test values",
});
const A = key(
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
);
const B = key(Buffer.alloc(32, 9).toString("base64"));

describe("common crypto", () => {
    it("round-trips under the key it was sealed with", () => {
        const sealed = encryptWithKey("ABCDE1234F", A);
        expect(decryptWithKey(sealed, A)).toBe("ABCDE1234F");
    });

    it("refuses to open with another key", () => {
        const sealed = encryptWithKey("ABCDE1234F", A);
        expect(() => decryptWithKey(sealed, B)).toThrow();
    });

    it("names the missing variable and what it protects", () => {
        expect(() =>
            encryptWithKey("x", key(undefined, "STAFF_PII_ENC_KEY")),
        ).toThrow(/STAFF_PII_ENC_KEY is not set.*test values/);
    });

    it("names the variable when the key is the wrong length", () => {
        expect(() =>
            encryptWithKey("x", key("too-short", "STAFF_PII_ENC_KEY")),
        ).toThrow(/STAFF_PII_ENC_KEY must decode to 32 bytes/);
    });

    it("digests a value under the key, per label", () => {
        const d = keyedDigest("ABCDE1234F", "fingerprint", A);
        expect(d).toBe(keyedDigest("ABCDE1234F", "fingerprint", A));
        expect(d).not.toBe(keyedDigest("ABCDE1234F", "fingerprint", B));
        expect(d).not.toBe(keyedDigest("ABCDE1234F", "other", A));
        expect(d).not.toContain("ABCDE1234F");
    });
});
