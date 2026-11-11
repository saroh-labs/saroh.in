import { createHmac } from "node:crypto";

import {
    mintSecret,
    SIGNATURE_TOLERANCE_S,
    signatureHeader,
    verifySignature,
} from "./signing";

const BODY = JSON.stringify({ id: "dlv_1", type: "booking.created" });
const NOW = new Date("2026-11-11T10:00:00Z");
const ago = (s: number) => new Date(NOW.getTime() - s * 1000);

describe("webhook signing (U13)", () => {
    it("signs t.body with HMAC-SHA256 and the time it is sent", () => {
        const header = signatureHeader(["whsec_a"], BODY, NOW);
        const t = Math.floor(NOW.getTime() / 1000);
        const hex = createHmac("sha256", "whsec_a")
            .update(`${t}.${BODY}`)
            .digest("hex");
        expect(header).toBe(`t=${t},v1=${hex}`);
        expect(verifySignature(header, BODY, "whsec_a", NOW)).toBe(true);
    });

    it("rejects a 6-minute-old signature, accepts a 4-minute-old one", () => {
        expect(SIGNATURE_TOLERANCE_S).toBe(300);
        const old = signatureHeader(["whsec_a"], BODY, ago(6 * 60));
        expect(verifySignature(old, BODY, "whsec_a", NOW)).toBe(false);
        const fresh = signatureHeader(["whsec_a"], BODY, ago(4 * 60));
        expect(verifySignature(fresh, BODY, "whsec_a", NOW)).toBe(true);
    });

    it("rejects another body, another secret or a mangled header", () => {
        const header = signatureHeader(["whsec_a"], BODY, NOW);
        expect(verifySignature(header, `${BODY} `, "whsec_a", NOW)).toBe(false);
        expect(verifySignature(header, BODY, "whsec_b", NOW)).toBe(false);
        expect(verifySignature("v1=abc", BODY, "whsec_a", NOW)).toBe(false);
        expect(verifySignature("", BODY, "whsec_a", NOW)).toBe(false);
    });

    it("signs with both secrets during a roll: either verifies", () => {
        const header = signatureHeader(["whsec_new", "whsec_old"], BODY, NOW);
        expect(header.match(/v1=/g)).toHaveLength(2);
        expect(verifySignature(header, BODY, "whsec_new", NOW)).toBe(true);
        expect(verifySignature(header, BODY, "whsec_old", NOW)).toBe(true);
    });

    it("mints a fresh secret each time", () => {
        const a = mintSecret();
        expect(a).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/);
        expect(mintSecret()).not.toBe(a);
    });
});
