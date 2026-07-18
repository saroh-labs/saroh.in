import { REDACTED, redactHeaders, redactObject } from "./redact";

describe("redactHeaders", () => {
    it("redacts auth/cookie headers but keeps the rest", () => {
        const out = redactHeaders({
            authorization: "Bearer secret-token",
            Cookie: "session=abc",
            "set-cookie": "session=abc",
            "content-type": "application/json",
            "user-agent": "jest",
        });
        expect(out.authorization).toBe(REDACTED);
        expect(out.Cookie).toBe(REDACTED); // case-insensitive match
        expect(out["set-cookie"]).toBe(REDACTED);
        expect(out["content-type"]).toBe("application/json");
        expect(out["user-agent"]).toBe("jest");
    });
});

describe("redactObject", () => {
    it("redacts sensitive fields regardless of case/separators", () => {
        const out = redactObject({
            name: "Widget",
            password: "hunter2",
            newPassword: "hunter3",
            access_token: "tok",
            "API-Key": "k",
            email: "a@b.com",
        }) as Record<string, unknown>;

        expect(out.name).toBe("Widget");
        expect(out.password).toBe(REDACTED);
        expect(out.newPassword).toBe(REDACTED);
        expect(out.access_token).toBe(REDACTED);
        expect(out["API-Key"]).toBe(REDACTED);
        expect(out.email).toBe(REDACTED);
    });

    it("recurses into nested objects and arrays", () => {
        const out = redactObject({
            user: { id: 1, token: "t", profile: { phone: "555" } },
            items: [{ cardNumber: "4111" }, { sku: "ok" }],
        }) as {
            user: { id: number; token: string; profile: { phone: string } };
            items: { cardNumber?: string; sku?: string }[];
        };

        expect(out.user.id).toBe(1);
        expect(out.user.token).toBe(REDACTED);
        expect(out.user.profile.phone).toBe(REDACTED);
        expect(out.items[0].cardNumber).toBe(REDACTED);
        expect(out.items[1].sku).toBe("ok");
    });

    it("passes primitives through untouched", () => {
        expect(redactObject("hello")).toBe("hello");
        expect(redactObject(42)).toBe(42);
        expect(redactObject(null)).toBeNull();
    });
});
