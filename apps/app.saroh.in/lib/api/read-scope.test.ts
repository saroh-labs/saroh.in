/**
 * One API answer per URL outside a render (DEC-259): a read route's GETs,
 * or only the business list during a write; never across requests, and a
 * failed fetch is asked again.
 */
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import {
    inReadScope,
    isOrganizationList,
    readOnce,
} from "@/lib/api/read-scope";

const API = "https://api.example.com";
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(new Response("[1]")));
    vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

it("asks once per URL in a scope, each caller reading its own copy", async () => {
    const bodies = await inReadScope(async () => {
        const [a, b] = await Promise.all([
            readOnce(`${API}/organizations`, {}),
            readOnce(`${API}/organizations`, {}),
        ]);
        await readOnce(`${API}/x/modules`, {});
        return [await a.text(), await b.text()];
    });
    expect(bodies).toEqual(["[1]", "[1]"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("outside a scope, and in the next request, asks every time", async () => {
    await readOnce(`${API}/organizations`, {});
    await readOnce(`${API}/organizations`, {});
    await inReadScope(() => readOnce(`${API}/organizations`, {}));
    await inReadScope(() => readOnce(`${API}/organizations`, {}));
    expect(fetchMock).toHaveBeenCalledTimes(4);
});

it("a write's scope keeps only the business list", async () => {
    await inReadScope(async () => {
        await readOnce(`${API}/organizations`, {});
        await readOnce(`${API}/organizations`, {});
        await readOnce(`${API}/x/home`, {});
        await readOnce(`${API}/x/home`, {});
    }, isOrganizationList);
    expect(fetchMock).toHaveBeenCalledTimes(3);
});

it("a failed fetch isn't kept", async () => {
    fetchMock.mockRejectedValueOnce(new Error("down"));
    await inReadScope(async () => {
        await expect(readOnce(`${API}/organizations`, {})).rejects.toThrow();
        await readOnce(`${API}/organizations`, {});
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
});
