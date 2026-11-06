import { afterEach, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => ({ value: undefined as string | undefined }));

vi.mock("next/headers", () => ({
    cookies: () =>
        Promise.resolve({
            get: () => (jar.value ? { value: jar.value } : undefined),
        }),
    headers: () => Promise.resolve(new Headers({ cookie: "session=example" })),
}));
vi.mock("@/lib/edition", () => ({ EDITION: "GLOBAL" }));

const MEMBER_OF = [
    { id: "org_india_first", edition: "INDIA" },
    { id: "org_global_one", edition: "GLOBAL" },
    { id: "org_global_two", edition: "GLOBAL" },
];

afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    jar.value = undefined;
});

async function activeOrg() {
    vi.stubGlobal(
        "fetch",
        vi.fn(() => Promise.resolve(new Response(JSON.stringify(MEMBER_OF)))),
    );
    const { getActiveOrgId } = await import("./http");
    return getActiveOrgId();
}

/**
 * The data layer picks the same business the header shows: one of this
 * deployment's edition. A person in both editions with no business chosen
 * saw India data under a Global name (6 Nov, Global app on a local stack).
 */
describe("the active business, on the Global app", () => {
    it("never falls back to another edition's business", async () => {
        expect(await activeOrg()).toBe("org_global_one");
    });

    it("keeps a chosen business of this edition", async () => {
        jar.value = "org_global_two";
        expect(await activeOrg()).toBe("org_global_two");
    });

    it("passes over a chosen business of the other edition", async () => {
        jar.value = "org_india_first";
        expect(await activeOrg()).toBe("org_global_one");
    });
});
