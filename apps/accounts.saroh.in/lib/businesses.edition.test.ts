import { afterEach, describe, expect, it, vi } from "vitest";

const respond = vi.hoisted(() => vi.fn());
vi.mock("./api", () => ({ apiFetch: respond }));

const rows = [
    { id: "a", edition: "INDIA" },
    { id: "b", edition: "GLOBAL" },
    { id: "c" },
];

async function listed(edition?: string) {
    if (edition) vi.stubEnv("NEXT_PUBLIC_EDITION", edition);
    vi.resetModules();
    respond.mockResolvedValue({ ok: true, json: () => rows });
    const { listBusinesses } = await import("./businesses");
    return (await listBusinesses()).map((b) => b.id);
}

describe("each edition's accounts", () => {
    afterEach(() => vi.unstubAllEnvs());

    it("lists only its own, an older API's rows being India's", async () => {
        await expect(listed()).resolves.toEqual(["a", "c"]);
        await expect(listed("GLOBAL")).resolves.toEqual(["b"]);
    });
});
