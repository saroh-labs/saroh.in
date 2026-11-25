// @vitest-environment jsdom
/**
 * API and AI apps › Connections on React Query (DEC-259, U35), in the
 * browser: the loader's piece at once and one read; the keys as their
 * start. A key made is shown once from the action's own answer and never
 * enters the cache; a revoke takes the tab's business and reads the keys
 * once; a refused revoke reads nothing.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
    fetch: vi.fn(),
    create: vi.fn(),
    revoke: vi.fn(),
}));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
    usePathname: () => "/settings/developers/keys",
}));
vi.mock("@/lib/api-keys/actions", () => ({
    createApiKey: (...a: unknown[]) => h.create(...a) as unknown,
    revokeApiKey: (...a: unknown[]) => h.revoke(...a) as unknown,
    rollApiKey: vi.fn(),
    updateApiKey: vi.fn(),
}));
vi.mock("@/lib/webhooks/actions", () => ({}));
vi.mock("@/lib/ai-connections/actions", () => ({}));
vi.mock("@/lib/settings/ask-ai-actions", () => ({}));
vi.mock("@/lib/saroh-billing/paid-plans-actions", () => ({}));
vi.mock("@saroh/ui/toast", () => ({
    showError: vi.fn(),
    showSuccess: vi.fn(),
    showInfo: vi.fn(),
}));

import { apiKeysRead } from "@/lib/api-keys/queries";
import { renderWithQuery } from "@/lib/query/test-utils";

import { KeysContainer } from "./containers";

const ORG = "org_1";
const KEY = {
    id: "k1",
    kind: "SECRET",
    name: "Order sync",
    prefix: "saroh_fake_Ab3d",
    scope: ["product:read"],
    allowedOrigins: [],
    aiEnabled: false,
    createdByUserId: "u1",
    rolledFromId: null,
    expiresAt: null,
    revokedAt: null,
    graceUntil: null,
    lastUsedAt: null,
    createdAt: "2031-11-01T00:00:00.000Z",
    madeBy: { id: "u1", name: "Asha", stillHere: true },
};
const SCREEN = { keys: [KEY] };
const TOKEN = "saroh_fake_Ab3dTHEWHOLESECRETTOKEN";

let unmount: (() => void) | undefined;
beforeEach(() => {
    h.fetch.mockReset();
    h.create.mockReset();
    h.revoke.mockReset();
    h.fetch.mockImplementation(() => Promise.resolve(Response.json(SCREEN)));
    vi.stubGlobal("fetch", h.fetch);
});
afterEach(() => {
    unmount?.();
    unmount = undefined;
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
});

const settle = async () => {
    for (let i = 0; i < 6; i++) {
        await act(() => new Promise((r) => setTimeout(r, 0)));
    }
};
const reads = () =>
    h.fetch.mock.calls.filter(([url]) =>
        String(url).startsWith("/api/settings/developers/keys"),
    ).length;
const button = (name: string) =>
    Array.from(document.querySelectorAll("button")).find(
        (b) =>
            b.textContent.trim() === name ||
            b.getAttribute("aria-label") === name,
    );
const press = async (name: string) => {
    const b = button(name);
    if (!b) throw new Error(`No button "${name}"`);
    await act(async () => {
        b.click();
        await Promise.resolve();
    });
    await settle();
};

function draw() {
    const r = renderWithQuery(
        <KeysContainer
            selfId="u1"
            business="Rye"
            actions={["product:read", "apikey:manage"]}
            open={["SECRET"]}
            cap={5}
            docs="https://docs.example.com"
            zone="Asia/Kolkata"
        />,
        { orgId: ORG },
    );
    unmount = r.unmount;
    return r;
}

describe("Connections (API keys)", () => {
    it("draws the loader's piece at once, then the keys by their start, from one read", async () => {
        const { host } = draw();
        expect(host.textContent).toContain("Loading this tab");
        expect(host.textContent).not.toContain("Order sync");
        await settle();
        expect(reads()).toBe(1);
        expect(button("Open Order sync")).toBeTruthy();
        expect(h.fetch.mock.calls[0]?.[1]).toMatchObject({
            headers: { "x-organization-id": ORG },
        });
    });

    it("shows a new key once from the action's answer; the cache never holds it", async () => {
        h.create.mockResolvedValue({
            ok: true,
            data: { key: { ...KEY, id: "k2", name: "Till" }, token: TOKEN },
        });
        const { client } = draw();
        await settle();
        await press("New key");
        const name = document.querySelector<HTMLInputElement>(
            '[role="dialog"] input[maxlength="80"]',
        );
        if (!name) throw new Error("No name field");
        act(() => {
            Reflect.set(HTMLInputElement.prototype, "value", "Till", name);
            name.dispatchEvent(new Event("input", { bubbles: true }));
        });
        await press("Create key");
        expect(h.create).toHaveBeenCalledTimes(1);
        // The tab's business last: a moved tab is refused (writeAsOrg).
        expect(h.create.mock.calls[0]?.[1]).toBe(ORG);
        expect(document.body.textContent).toContain(TOKEN);
        const held = JSON.stringify(
            client
                .getQueryCache()
                .getAll()
                .map((q) => q.state.data),
        );
        expect(held).not.toContain(TOKEN);
        expect(client.getQueryData(apiKeysRead.key(ORG, {}))).toBeDefined();
    });

    it("revokes with the tab's business and reads the keys once; a refusal reads nothing", async () => {
        draw();
        await settle();
        expect(reads()).toBe(1);

        h.revoke.mockResolvedValueOnce({ ok: false, error: "Not yours." });
        await press("Open Order sync");
        await press("Revoke");
        await press("Revoke key");
        expect(h.revoke).toHaveBeenCalledWith("k1", ORG);
        expect(reads()).toBe(1);

        h.revoke.mockResolvedValueOnce({ ok: true, data: KEY });
        if (!button("Revoke key")) {
            if (!button("Revoke")) await press("Open Order sync");
            await press("Revoke");
        }
        await press("Revoke key");
        expect(h.revoke).toHaveBeenCalledTimes(2);
        expect(reads()).toBe(2);
    });
});
