// @vitest-environment jsdom
/**
 * The editor's pickers on React Query (U33): every picker that asks for a
 * kind shares one cached entry, under that kind's own domain; a picker
 * opened again draws from the cache at once and reads again only when the
 * entry is stale (a save on Products invalidates it) or a price changed
 * (`version`). Without a provider (a test host) the Server Action is read,
 * as before.
 */
import { act, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const action = vi.hoisted(() => vi.fn());
vi.mock("@/lib/services/actions", () => ({
    listServicesForPicker: () => action() as unknown,
}));
vi.mock("@/lib/sites/actions", () => ({ listGridCatalogue: vi.fn() }));

import { useServicesForPicker } from "@/components/sites/blocks/use-services-for-picker";
import { productsKeys } from "@/lib/products/queries";
import { makeTestClient, renderWithQuery } from "@/lib/query/test-utils";

const ORG = "org_1";
const SERVICES = {
    ok: true,
    services: [{ id: "s1", name: "Bridal makeup", status: "ACTIVE" }],
};
const fetches: string[] = [];
let status = 200;

beforeEach(() => {
    fetches.length = 0;
    status = 200;
    action.mockReset();
    vi.stubGlobal(
        "fetch",
        vi.fn((url: string) => {
            fetches.push(url);
            return Promise.resolve(
                new Response(
                    JSON.stringify(
                        status === 200 ? SERVICES : { code: "forbidden" },
                    ),
                    { status, headers: { "content-type": "application/json" } },
                ),
            );
        }),
    );
});
afterEach(() => vi.unstubAllGlobals());

/** A picker that says where its read stands, for the test to read. */
function Picker({ name, version = 0 }: { name: string; version?: number }) {
    const load = useServicesForPicker(version);
    return (
        <p data-picker={name}>
            {load.status}
            {load.status === "failed" && load.forbidden ? " forbidden" : ""}
        </p>
    );
}
const seen = (name: string) =>
    document.querySelector(`[data-picker="${name}"]`)?.textContent ?? "";

/** A price changed in the editor: the host bumps the version. */
function Bumped() {
    const [version, setVersion] = useState(0);
    return (
        <>
            <button type="button" onClick={() => setVersion((v) => v + 1)}>
                Bump
            </button>
            <Picker name="bumped" version={version} />
        </>
    );
}

describe("usePickerRead", () => {
    it("three pickers share one read; a picker opened again draws from the cache with no read", async () => {
        const client = makeTestClient();
        const view = renderWithQuery(
            <>
                <Picker name="inspector" />
                <Picker name="add" />
                <Picker name="embed" />
            </>,
            { client, orgId: ORG },
        );
        await vi.waitFor(() => expect(seen("embed")).toBe("ready"));
        expect(fetches).toEqual(["/api/sites/pickers?kind=services"]);
        expect(client.getQueryData(["services", ORG, "picker"])).toEqual(
            SERVICES,
        );
        view.unmount();

        const again = renderWithQuery(<Picker name="reopened" />, {
            client,
            orgId: ORG,
        });
        // First paint is the cache: no loading, no read.
        expect(seen("reopened")).toBe("ready");
        expect(fetches).toHaveLength(1);
        again.unmount();
        expect(action).not.toHaveBeenCalled();
    });

    it("a stale entry opens from the cache, then reads again; a price change (version) reads again", async () => {
        const client = makeTestClient();
        client.setQueryData(["services", ORG, "picker"], SERVICES);
        await client.invalidateQueries({ queryKey: ["services", ORG] });
        const view = renderWithQuery(<Bumped />, { client, orgId: ORG });
        // The cache at once, read again behind it.
        expect(seen("bumped")).toBe("ready");
        await vi.waitFor(() => expect(fetches).toHaveLength(1));
        act(() => view.host.querySelector("button")?.click());
        await vi.waitFor(() => expect(fetches).toHaveLength(2));
        // The rows stay on screen meanwhile.
        expect(seen("bumped")).toBe("ready");
        view.unmount();
    });

    it("the products picker sits under Products' key: a Products save marks it stale", async () => {
        const client = makeTestClient();
        client.setQueryData(["products", ORG, "picker"], { ok: true });
        await act(() =>
            client.invalidateQueries({
                queryKey: productsKeys(ORG),
                refetchType: "none",
            }),
        );
        expect(
            client.getQueryState(["products", ORG, "picker"])?.isInvalidated,
        ).toBe(true);
    });

    it("a refusal is `forbidden`, never an empty list", async () => {
        status = 403;
        const view = renderWithQuery(<Picker name="refused" />, {
            orgId: ORG,
        });
        await vi.waitFor(() =>
            expect(seen("refused")).toBe("failed forbidden"),
        );
        view.unmount();
    });
});
