import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Opening a business of the other edition (KTD12): only the API's
 * `edition_address` refusal, which it gives after checking membership, sends
 * a member to that edition's own app, at a fixed address, with `to` kept.
 * A stranger, a paused door and a bad id stay on this app's pages.
 */
const env = vi.hoisted(() => ({
    NODE_ENV: "test",
    API_URL: "https://api.saroh.in",
}));
const api = vi.hoisted(() => ({
    apiFetch: vi.fn(),
    setActiveOrganization: vi.fn(),
}));

vi.mock("next/headers", () => ({
    cookies: () => Promise.resolve({ set: vi.fn() }),
}));
vi.mock("next/navigation", () => ({
    redirect: (to: string) => {
        throw new Error(`redirect:${to}`);
    },
}));
vi.mock("@/env", () => ({ env }));
vi.mock("@/lib/edition", () => ({ EDITION: "INDIA" }));
vi.mock("@/lib/api/http", () => ({ apiFetch: api.apiFetch }));
vi.mock("@/lib/organizations/actions", () => ({
    setActiveOrganization: api.setActiveOrganization,
}));

import { NOT_YOURS_HREF, PAUSED_ERROR } from "@/lib/organizations/choose";

import { GET } from "./route";

const refusal = (status: number, reason?: string) =>
    new Response(
        JSON.stringify({
            error: { message: "no", details: reason ? { reason } : undefined },
        }),
        { status, headers: { "content-type": "application/json" } },
    );

async function open(id: string, query = "", host = "app.saroh.in") {
    try {
        await GET(
            new Request(`https://${host}/open/${id}${query}`, {
                headers: { host },
            }),
            { params: Promise.resolve({ organizationId: id }) },
        );
    } catch (error) {
        return (error as Error).message.replace(/^redirect:/, "");
    }
    throw new Error("expected a redirect");
}

beforeEach(() => {
    vi.clearAllMocks();
    env.API_URL = "https://api.saroh.in";
    api.setActiveOrganization.mockResolvedValue({
        ok: false,
        error: "You aren't in that business.",
    });
});

describe("GET /open/[organizationId]", () => {
    it("sends a member to the Global app's door, keeping `to`", async () => {
        api.apiFetch.mockResolvedValue(refusal(403, "edition_address"));
        const to = await open("org_global1", "?to=%2Forders%3Fx%3D1");
        expect(to).toBe(
            "https://app.saroh.tech/open/org_global1?to=%2Forders%3Fx%3D1",
        );
        expect(api.apiFetch).toHaveBeenCalledWith("/organizations/org_global1");
    });

    it("takes the host from its own environment, never the request", async () => {
        api.apiFetch.mockResolvedValue(refusal(403, "edition_address"));
        const to = await open("org_global1", "", "evil.example.com");
        expect(new URL(to).host).toBe("app.saroh.tech");
    });

    it("keeps a stranger on the not-yours page", async () => {
        api.apiFetch.mockResolvedValue(refusal(403));
        expect(await open("org_other", "?to=//evil.example.com")).toBe(
            NOT_YOURS_HREF,
        );
        api.apiFetch.mockResolvedValue(refusal(404));
        expect(await open("org_other")).toBe(NOT_YOURS_HREF);
    });

    it("never passes an unsafe `to` on", async () => {
        api.apiFetch.mockResolvedValue(refusal(403, "edition_address"));
        const to = new URL(await open("org_global1", "?to=//evil.example.com"));
        expect(to.searchParams.get("to")).toBe("/");
    });

    it("doesn't ask the API about an id that isn't one", async () => {
        expect(await open("..%2Fadmin")).toBe(NOT_YOURS_HREF);
        expect(api.apiFetch).not.toHaveBeenCalled();
    });

    it("stays put on an API of no edition (local) and on a paused door", async () => {
        env.API_URL = "https://api.saroh.localhost";
        expect(await open("org_global1")).toBe(NOT_YOURS_HREF);
        env.API_URL = "https://api.saroh.in";
        api.setActiveOrganization.mockResolvedValue({
            ok: false,
            error: PAUSED_ERROR,
        });
        await open("org_global1");
        expect(api.apiFetch).not.toHaveBeenCalled();
    });

    it("opens a business of this edition as before", async () => {
        api.setActiveOrganization.mockResolvedValue({
            ok: true,
            data: { id: "org_1", name: "Rye", role: "OWNER" },
        });
        expect(await open("org_1", "?to=%2Forders")).toBe("/orders");
        expect(api.apiFetch).not.toHaveBeenCalled();
    });
});
