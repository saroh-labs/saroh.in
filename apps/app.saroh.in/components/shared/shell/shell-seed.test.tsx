// @vitest-environment jsdom
/**
 * The layout's shell reads, handed to the browser (owner, 25 Nov 2026): on
 * a full load the shell's two queries are filled from the document's own
 * response and neither route is asked; a failed seed asks its route once;
 * a save still reads `/api/shell` again; a switch keeps each business's.
 */
import { useQuery } from "@tanstack/react-query";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useOrgId } from "@/lib/query/org";
import { renderWithQuery } from "@/lib/query/test-utils";
import type { ShellLive, ShellSettings } from "@/lib/shell/queries";
import { shellLiveRead, shellSettingsRead } from "@/lib/shell/queries";

import { ShellSeed } from "./shell-seed";

const SETTINGS: ShellSettings = {
    moduleKeys: ["COMMERCE"],
    locked: [],
    sites: [],
    storefronts: null,
    stockTracked: false,
    paymentDue: null,
    planEnding: null,
    paused: null,
    accountManager: null,
    askAi: null,
    websiteArea: false,
};
const LIVE: ShellLive = { unread: 3, counts: { "/commerce/orders": 2 } };

/** What React's stream hands a client component: `then` returns nothing. */
const streamed = <T,>(value: T): Promise<T> =>
    ({
        then(resolve: (v: T) => void) {
            resolve(value);
        },
    }) as unknown as Promise<T>;

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
    fetchMock = vi.fn((url: string) =>
        Promise.resolve(
            Response.json(
                url === "/api/shell"
                    ? { ...SETTINGS, websiteArea: true }
                    : LIVE,
            ),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

/** The shell's readers, as `shell-reads.tsx` asks. */
function Readers() {
    const orgId = useOrgId();
    const settings = useQuery(shellSettingsRead.options(orgId, {})).data;
    const live = useQuery(shellLiveRead.options(orgId, {})).data;
    return (
        <p>
            {settings ? `modules:${settings.moduleKeys?.join(",")}` : "-"}
            {live ? ` unread:${live.unread}` : ""}
        </p>
    );
}

const flush = () =>
    act(async () => {
        await new Promise((r) => setTimeout(r, 0));
    });
const asked = () => fetchMock.mock.calls.map((c) => String(c[0]));

describe("the shell seed", () => {
    it("fills both keys from the layout's reads and asks no route", async () => {
        let resolve!: (v: ShellSettings) => void;
        const settings = new Promise<ShellSettings | null>((r) => {
            resolve = r;
        });
        const { host, client, unmount } = renderWithQuery(
            <>
                <ShellSeed
                    orgId="org_1"
                    seed={{ settings, live: streamed(LIVE) }}
                />
                <Readers />
            </>,
        );
        // Still on its way: the readers joined it, nothing was asked.
        expect(asked()).toEqual([]);
        await act(async () => {
            resolve(SETTINGS);
            await settings;
        });
        await flush();
        expect(host.textContent).toBe("modules:COMMERCE unread:3");
        expect(asked()).toEqual([]);
        expect(
            client.getQueryState(shellSettingsRead.key("org_1", {}))
                ?.dataUpdatedAt,
        ).toBeGreaterThan(0);

        // A settings save reads `/api/shell` again, once, from the route.
        await act(() =>
            client.invalidateQueries({
                queryKey: shellSettingsRead.key("org_1", {}),
            }),
        );
        await flush();
        expect(asked()).toEqual(["/api/shell"]);
        expect(
            client.getQueryData<ShellSettings>(
                shellSettingsRead.key("org_1", {}),
            )?.websiteArea,
        ).toBe(true);
        unmount();
    });

    it("a failed seed asks its route once", async () => {
        const { host, unmount } = renderWithQuery(
            <>
                <ShellSeed
                    orgId="org_1"
                    seed={{
                        settings: Promise.resolve(null),
                        live: Promise.reject(new Error("down")),
                    }}
                />
                <Readers />
            </>,
        );
        await flush();
        await flush();
        expect(asked().sort()).toEqual(["/api/shell", "/api/shell/live"]);
        expect(host.textContent).toBe("modules:COMMERCE unread:3");
        unmount();
    });

    it("is keyed by the business: another's entries stay", async () => {
        const { client, unmount } = renderWithQuery(
            <ShellSeed
                orgId="org_2"
                seed={{
                    settings: Promise.resolve(SETTINGS),
                    live: Promise.resolve(LIVE),
                }}
            />,
            { orgId: "org_2" },
        );
        client.setQueryData(shellSettingsRead.key("org_1", {}), {
            ...SETTINGS,
            moduleKeys: ["CRM"],
        });
        await flush();
        expect(
            client.getQueryData<ShellSettings>(
                shellSettingsRead.key("org_2", {}),
            )?.moduleKeys,
        ).toEqual(["COMMERCE"]);
        expect(
            client.getQueryData<ShellSettings>(
                shellSettingsRead.key("org_1", {}),
            )?.moduleKeys,
        ).toEqual(["CRM"]);
        expect(asked()).toEqual([]);
        unmount();
    });
});
