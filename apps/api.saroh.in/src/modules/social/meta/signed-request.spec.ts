import { parseSignedRequest, signRequest } from "./signed-request";

const secret = "test-app-secret";
const now = new Date("2026-11-18T10:00:00Z");
const issuedAt = Math.floor(now.getTime() / 1000) - 60;

describe("Meta's signed_request", () => {
    it("takes one signed with any of the login's secrets", () => {
        const req = signRequest(
            { algorithm: "HMAC-SHA256", issued_at: issuedAt, user_id: "12345" },
            secret,
        );
        expect(parseSignedRequest(req, ["other", secret], now)).toEqual({
            userId: "12345",
            issuedAt,
        });
    });

    it("refuses a bad signature, a changed payload, and nonsense", () => {
        const req = signRequest({ issued_at: issuedAt, user_id: "1" }, secret);
        expect(parseSignedRequest(req, ["wrong"], now)).toBe("invalid");
        const [sig] = req.split(".");
        const forged = Buffer.from(
            JSON.stringify({ issued_at: issuedAt, user_id: "2" }),
        ).toString("base64url");
        expect(parseSignedRequest(`${sig}.${forged}`, [secret], now)).toBe(
            "invalid",
        );
        expect(parseSignedRequest("nope", [secret], now)).toBe("invalid");
        expect(parseSignedRequest(undefined, [secret], now)).toBe("invalid");
        expect(parseSignedRequest(req, [], now)).toBe("invalid");
    });

    it("refuses one issued more than a day ago", () => {
        const req = signRequest(
            { issued_at: issuedAt - 2 * 86_400, user_id: "1" },
            secret,
        );
        expect(parseSignedRequest(req, [secret], now)).toBe("expired");
    });
});
