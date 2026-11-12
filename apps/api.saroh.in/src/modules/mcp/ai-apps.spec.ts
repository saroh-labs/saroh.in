import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import {
    actionsForScopes,
    imitatesKnownName,
    isKnownClient,
    LOOK_ALIKES,
    NEVER_FOR_AI,
    refusedClient,
} from "./ai-apps";
import { oauthGate } from "./oauth-gate";

describe("AI apps' scopes (U9)", () => {
    it("reads with saroh:read only", () => {
        const read = actionsForScopes(["saroh:read"]);
        expect(read.has("order:read")).toBe(true);
        expect(read.has("notification:read-own")).toBe(true);
        expect(read.has("order:write")).toBe(false);
        expect(read.has("site:publish")).toBe(false);
    });

    it("writes with saroh:write, and publishes only with site:publish", () => {
        const write = actionsForScopes(["saroh:write"]);
        expect(write.has("order:write")).toBe(true);
        expect(write.has("order:read")).toBe(false);
        expect(write.has("site:publish")).toBe(false);
        expect(actionsForScopes(["site:publish"])).toEqual(
            new Set(["site:publish"]),
        );
    });

    it("never grants the owner's or sensitive powers, whatever is asked", () => {
        const all = actionsForScopes([
            "saroh:read",
            "saroh:write",
            "site:publish",
        ]);
        for (const never of NEVER_FOR_AI) expect(all.has(never)).toBe(false);
        for (const a of [
            "apikey:manage",
            "webhook:manage",
            "customer:sensitive",
            "billing:manage",
            "org:delete",
        ]) {
            expect(NEVER_FOR_AI.has(a as never)).toBe(true);
        }
    });
});

describe("AI apps' names (U9)", () => {
    it("knows only the providers' own metadata documents", () => {
        expect(
            isKnownClient("https://claude.ai/oauth/mcp-oauth-client-metadata"),
        ).toBe(true);
        expect(isKnownClient("https://chatgpt.com/oauth/client.json")).toBe(
            true,
        );
        expect(isKnownClient("https://claude.ai.evil.example/x")).toBe(false);
        expect(isKnownClient("http://claude.ai/x")).toBe(false);
        expect(isKnownClient("a1b2c3")).toBe(false);
    });

    it("maps each look-alike letter to one Latin letter", () => {
        expect(LOOK_ALIKES.size).toBe(48);
        for (const latin of LOOK_ALIKES.values()) {
            expect(latin).toMatch(/^[A-Za-z]$/);
        }
    });

    it("catches imitations through spacing, case and digits", () => {
        for (const name of [
            "Claude",
            "Chat GPT",
            "S.a.r.o.h helper",
            "0penAI tools",
            "ANTHROPIC",
        ]) {
            expect(imitatesKnownName(name)).toBe(true);
        }
        for (const name of [
            "\u0421laude", // Cyrillic С
            "Ch\u0430tGPT", // Cyrillic а
            "\u039fpenAI", // Greek Ο
            "SAR\u039fH", // Greek Ο
            "\u{1d402}laude", // mathematical bold C
            "Ｃｌａｕｄｅ", // fullwidth
        ]) {
            expect(imitatesKnownName(name)).toBe(true);
        }
        for (const name of ["Cursor", "MCP Inspector", "Курсор", "", null]) {
            expect(imitatesKnownName(name)).toBe(false);
        }
    });

    it("refuses an unknown app wearing a known name, never the known app", () => {
        expect(refusedClient({ clientId: "dyn-1", name: "Claude" })).toBe(true);
        expect(
            refusedClient({
                clientId: "https://claude.ai/oauth/claude-code-client-metadata",
                name: "Claude Code",
            }),
        ).toBe(false);
        expect(refusedClient({ clientId: "dyn-2", name: "Cursor" })).toBe(
            false,
        );
    });
});

describe("oauthGate (U9)", () => {
    const on = {
        isEnabled: jest.fn().mockResolvedValue(true),
    } as unknown as FeatureFlagService;
    const off = {
        isEnabled: jest.fn().mockResolvedValue(false),
    } as unknown as FeatureFlagService;
    const req = (path: string, init?: RequestInit) =>
        new Request(`https://api.saroh.in${path}`, init);

    it("leaves sign-in alone, and closes every OAuth route while API_MCP is off", async () => {
        expect(await oauthGate(req("/api/auth/sign-in/email"), off)).toBeNull();
        for (const path of [
            "/api/auth/oauth2/authorize",
            "/api/auth/oauth2/token",
            "/api/auth/oauth2/register",
            "/api/auth/jwks",
            "/api/auth/.well-known/oauth-authorization-server",
        ]) {
            expect((await oauthGate(req(path), off))?.status).toBe(404);
            expect(await oauthGate(req(path), on)).toBeNull();
        }
    });

    it("closes continue and consent to callers outside the API", async () => {
        for (const step of ["continue", "consent"]) {
            const res = await oauthGate(
                req(`/api/auth/oauth2/${step}`, { method: "POST", body: "{}" }),
                on,
            );
            expect(res?.status).toBe(404);
        }
    });

    it("refuses a registration wearing a known name", async () => {
        const register = (client_name: string) =>
            req("/api/auth/oauth2/register", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    client_name,
                    redirect_uris: ["http://127.0.0.1/cb"],
                }),
            });
        const refused = await oauthGate(register("ChatGPT"), on);
        expect(refused?.status).toBe(400);
        expect(await refused?.json()).toMatchObject({
            error: "invalid_client_metadata",
        });
        expect(await oauthGate(register("Cursor"), on)).toBeNull();
        const signedIn = (path: string, body: unknown) =>
            req(`/api/auth/oauth2/${path}`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(body),
            });
        expect(
            (
                await oauthGate(
                    signedIn("create-client", { client_name: "Claude" }),
                    on,
                )
            )?.status,
        ).toBe(400);
        expect(
            (
                await oauthGate(
                    signedIn("update-client", {
                        client_id: "x",
                        update: { client_name: "\u0421laude" },
                    }),
                    on,
                )
            )?.status,
        ).toBe(400);
    });
});
