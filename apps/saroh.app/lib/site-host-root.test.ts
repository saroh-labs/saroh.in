import { afterEach, describe, expect, it, vi } from "vitest";

const shape = vi.hoisted(() => ({
    env: {
        API_URL: "https://api.test",
        NEXT_PUBLIC_ROOT_DOMAIN: undefined as string | undefined,
    },
}));

vi.mock("@/env", () => ({ env: shape.env }));
vi.mock("next/headers", () => ({ headers: vi.fn() }));

import { getSiteForHost, subdomainFromHost } from "./publication";

/** Whichever root a stack runs on, its addresses resolve; and with none set. */

function answerRye() {
    const fetched = vi.fn((input: string) =>
        Promise.resolve(
            input.endsWith("/by-subdomain/rye")
                ? new Response(
                      JSON.stringify({
                          snapshot: { site: { name: "Rye" }, pages: [] },
                      }),
                  )
                : new Response("{}", { status: 404 }),
        ),
    );
    vi.stubGlobal("fetch", fetched);
    return fetched;
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe.each([
    // Local dev, under portless.
    ["saroh.app.localhost", "rye.saroh.app.localhost"],
    // CI's and the full gate's browser stack.
    ["localhost", "rye.saroh.app.localhost"],
    ["localhost", "rye.localhost"],
    // Dev's Worker.
    ["saroh.dev", "rye.saroh.dev"],
    ["saroh.app", "rye.saroh.app"],
])("under the root %s", (root, host) => {
    it(`${host} is the merchant at rye`, async () => {
        shape.env.NEXT_PUBLIC_ROOT_DOMAIN = root;
        const fetched = answerRye();
        expect(subdomainFromHost(host)).toBe("rye");
        const site = await getSiteForHost(host);
        expect(site?.snapshot.site.name).toBe("Rye");
        expect(fetched).toHaveBeenCalledTimes(1);
    });
});

describe("with no root domain set", () => {
    it("still goes by the first label, as it always has", async () => {
        shape.env.NEXT_PUBLIC_ROOT_DOMAIN = undefined;
        const fetched = answerRye();
        expect(subdomainFromHost("rye.client.com")).toBe("rye");
        expect(subdomainFromHost("www.client.com")).toBeNull();
        expect(subdomainFromHost("localhost")).toBeNull();
        const site = await getSiteForHost("rye.client.com");
        expect(site?.snapshot.site.name).toBe("Rye");
        expect(fetched).toHaveBeenCalledTimes(1);
    });
});
