// @vitest-environment jsdom
/**
 * The shell's React Query provider (DEC-259): it holds the business list
 * the server read, gives the open business to `useOrgId`, and hears the
 * other tabs: a switch there draws this tab again and keeps its cache, a
 * sign-out there clears it. A later server render's list replaces the
 * held one only once a writer marked it stale, and drops the businesses
 * no longer on it.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Organization } from "@/lib/organizations/service";
import { announce } from "@/lib/query/broadcast";
import {
    getBrowserQueryClient,
    onReadError,
    ReadFailed,
    resetReadErrorGuard,
} from "@/lib/query/client";
import { invalidateOrganizations } from "@/lib/query/invalidate";
import { domainKey, ORGANIZATIONS_KEY } from "@/lib/query/keys";
import { useOrgId } from "@/lib/query/org";

import { QueryProvider } from "./query-provider";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const org = (id: string, name: string) =>
    ({ id, name, slug: id, role: "OWNER" }) as Organization;

let root: Root;
let host: HTMLDivElement;
const qc = () => getBrowserQueryClient();

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    refresh.mockReset();
    resetReadErrorGuard();
    qc().clear();
});
afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
});

function ShowOrg() {
    return <span>{useOrgId()}</span>;
}
/** What another tab's `announce` sends: its own tab id. */
function fromOtherTab(kind: "switch" | "signout") {
    const c = new BroadcastChannel("saroh-query");
    c.postMessage({ kind, from: "other-tab" });
    c.close();
}

const draw = (orgs: Organization[]) =>
    act(() =>
        root.render(
            <QueryProvider orgId="o1" organizations={orgs}>
                <ShowOrg />
            </QueryProvider>,
        ),
    );

describe("QueryProvider", () => {
    it("gives the open business and holds the server's list", () => {
        draw([org("o1", "Northwind")]);
        expect(host.textContent).toBe("o1");
        expect(qc().getQueryData(ORGANIZATIONS_KEY)).toEqual([
            org("o1", "Northwind"),
        ]);
    });

    it("a later render's list waits for a writer to mark it stale", () => {
        draw([org("o1", "Northwind")]);
        draw([org("o1", "Renamed")]);
        expect(
            qc().getQueryData<Organization[]>(ORGANIZATIONS_KEY)?.[0]?.name,
        ).toBe("Northwind");
        act(() => invalidateOrganizations());
        draw([org("o1", "Renamed again")]);
        expect(
            qc().getQueryData<Organization[]>(ORGANIZATIONS_KEY)?.[0]?.name,
        ).toBe("Renamed again");
    });

    it("a 403 on a read marks the held list stale, so the next render's replaces it", () => {
        draw([org("o1", "Northwind"), org("o2", "Left")]);
        act(() => onReadError(qc(), new ReadFailed(403)));
        expect(refresh).toHaveBeenCalledTimes(1);
        draw([org("o1", "Northwind")]);
        expect(qc().getQueryData<Organization[]>(ORGANIZATIONS_KEY)).toEqual([
            org("o1", "Northwind"),
        ]);
    });

    it("another tab's switch draws this one again and keeps its cache", async () => {
        draw([org("o1", "Northwind")]);
        qc().setQueryData(domainKey("orders", "o1", "list"), [1]);
        fromOtherTab("switch");
        await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
        expect(qc().getQueryData(domainKey("orders", "o1", "list"))).toEqual([
            1,
        ]);
    });

    it("a business gone from a fresh list is dropped, the others kept", () => {
        draw([org("o1", "Northwind"), org("o2", "Left")]);
        qc().setQueryData(domainKey("orders", "o1", "list"), [1]);
        qc().setQueryData(domainKey("orders", "o2", "list"), [2]);
        act(() => invalidateOrganizations());
        draw([org("o1", "Northwind")]);
        expect(qc().getQueryData(domainKey("orders", "o1", "list"))).toEqual([
            1,
        ]);
        expect(qc().getQueryData(domainKey("orders", "o2", "list"))).toBe(
            undefined,
        );
    });

    it("its own switch isn't heard: the page is drawn once, its new cache kept", async () => {
        draw([org("o1", "Northwind")]);
        announce("switch");
        // Delivered or not, give the message a turn, then a second marker.
        await new Promise((r) => setTimeout(r, 20));
        qc().setQueryData(domainKey("orders", "o2", "list"), [1]);
        await new Promise((r) => setTimeout(r, 20));
        expect(refresh).not.toHaveBeenCalled();
        expect(qc().getQueryData(domainKey("orders", "o2", "list"))).toEqual([
            1,
        ]);
    });

    it("another tab's sign-out clears this one and reloads it", async () => {
        const real = window.location;
        const reload = vi.fn();
        Object.defineProperty(window, "location", {
            configurable: true,
            value: { ...real, reload },
        });
        try {
            draw([org("o1", "Northwind")]);
            qc().setQueryData(domainKey("orders", "o1", "list"), [1]);
            fromOtherTab("signout");
            await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
            expect(qc().getQueryCache().getAll()).toHaveLength(0);
            expect(refresh).not.toHaveBeenCalled();
        } finally {
            Object.defineProperty(window, "location", {
                configurable: true,
                value: real,
            });
        }
    });

    it("useOrgId outside the provider throws", () => {
        const spy = vi
            .spyOn(console, "error")
            .mockImplementation(() => undefined);
        expect(() => act(() => root.render(<ShowOrg />))).toThrow(
            /OrgProvider/,
        );
        spy.mockRestore();
    });
});
