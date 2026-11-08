/**
 * B5: the shell's list is this edition's businesses only, so a person whose
 * businesses are all on the other edition has none here, and the shell
 * sends them to setup (`SetupFirst`). India keeps its own, an older API's
 * rows (no edition) being India's.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const edition = vi.hoisted(() => ({ value: "GLOBAL" }));
const respond = vi.hoisted(() => vi.fn());
vi.mock("@/lib/edition", () => ({
    get EDITION() {
        return edition.value;
    },
    PROFILE: {},
}));
vi.mock("@/lib/api/http", () => ({
    apiFetch: respond,
    getActiveOrgId: vi.fn(),
}));

import { listOrganizations } from "./service";

const rows = (list: object[]) =>
    respond.mockResolvedValue({ ok: true, json: () => Promise.resolve(list) });

describe("the shell's businesses by edition", () => {
    afterEach(() => {
        edition.value = "GLOBAL";
    });

    it("Global, a person with only an India business: none (setup)", async () => {
        rows([{ id: "in", edition: "INDIA", roleLabel: null }, { id: "old" }]);
        await expect(listOrganizations()).resolves.toEqual([]);
    });

    it("India: an India business (and an older API's row) still listed", async () => {
        edition.value = "INDIA";
        rows([
            { id: "in", edition: "INDIA", roleLabel: null },
            { id: "old", roleLabel: null },
            { id: "gl", edition: "GLOBAL", roleLabel: null },
        ]);
        const ids = (await listOrganizations()).map((o) => o.id);
        expect(ids).toEqual(["in", "old"]);
    });
});
