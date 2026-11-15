// DB-free, network-free unit tests for the shared AES-256-GCM sealing. The
// key is a parameter, so two keys can be told apart without touching env.
import type { EncryptionKey } from "./crypto";
import {
    decryptWithKey,
    encryptWithKey,
    keyedDigest,
    keyedDigests,
    newestKeyId,
    resealWithKey,
    storedKeyId,
} from "./crypto";

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

describe("the key ring", () => {
    const hexA =
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const b64B = Buffer.alloc(32, 9).toString("base64");
    const ring = key(`v2:${b64B}, v1:${hexA}`, "STAFF_PII_ENC_KEY");

    it("reads one key as v1 and a ring newest first", () => {
        expect(newestKeyId(A)).toBe("v1");
        expect(newestKeyId(ring)).toBe("v2");
    });

    it("names the variable and the id, never a value, for a bad key", () => {
        const bad = key(`v2:short,v1:${hexA}`, "STAFF_PII_ENC_KEY");
        expect(() => encryptWithKey("x", bad)).toThrow(
            /^STAFF_PII_ENC_KEY key "v2" must decode to 32 bytes/,
        );
        try {
            encryptWithKey("x", bad);
        } catch (e) {
            expect((e as Error).message).not.toContain(hexA);
            expect((e as Error).message).not.toContain("short");
        }
    });

    it("refuses a bad id, a missing id and a repeated id", () => {
        for (const value of [
            `V2:${b64B},v1:${hexA}`,
            `v-2:${b64B}`,
            `${b64B},v1:${hexA}`,
            `v1:${b64B},v1:${hexA}`,
            `v2:${b64B},`,
        ]) {
            expect(() => encryptWithKey("x", key(value, "X_KEY"))).toThrow(
                /^X_KEY /,
            );
        }
    });

    it("seals with the newest key and records its id", () => {
        const sealed = encryptWithKey("ABCDE1234F", ring);
        expect(sealed.ciphertext.startsWith("v2:")).toBe(true);
        expect(storedKeyId(sealed.ciphertext)).toBe("v2");
        expect(decryptWithKey(sealed, ring)).toBe("ABCDE1234F");
    });

    it("stores a v1 value with no prefix, as before the ring", () => {
        const sealed = encryptWithKey("ABCDE1234F", A);
        expect(sealed.ciphertext).not.toContain(":");
        expect(storedKeyId(sealed.ciphertext)).toBe("v1");
    });

    it("opens an old unprefixed value and a prefixed one on the ring", () => {
        const old = encryptWithKey("old", A); // today's stored form
        expect(decryptWithKey(old, ring)).toBe("old");
        const prefixed = { ...old, ciphertext: `v1:${old.ciphertext}` };
        expect(decryptWithKey(prefixed, ring)).toBe("old");
    });

    it("names the variable and the missing id when a key was removed", () => {
        const sealed = encryptWithKey("x", ring);
        expect(() =>
            decryptWithKey(sealed, key(hexA, "STAFF_PII_ENC_KEY")),
        ).toThrow(/^STAFF_PII_ENC_KEY has no key "v2"/);
    });

    it("fingerprints with the newest key and matches under any key", () => {
        const before = keyedDigest("ABCDE1234F", "fingerprint", A);
        const now = keyedDigest("ABCDE1234F", "fingerprint", ring);
        expect(now.startsWith("v2:")).toBe(true);
        const all = keyedDigests("ABCDE1234F", "fingerprint", ring);
        expect(all).toEqual([now, before]);
    });

    it("re-seals onto the newest key once, then leaves it", () => {
        const old = encryptWithKey("x", A);
        const moved = resealWithKey(old, ring);
        expect(moved && storedKeyId(moved.ciphertext)).toBe("v2");
        expect(decryptWithKey(moved!, ring)).toBe("x");
        expect(resealWithKey(moved!, ring)).toBeNull();
        expect(resealWithKey(old, A)).toBeNull();
    });
});
