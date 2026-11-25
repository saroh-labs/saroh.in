// @vitest-environment jsdom
/**
 * Modules, Integrations and Plan and billing on React Query (DEC-259), in
 * the browser. With nothing held, each draws its real title and the
 * loader's pieces at once, no rows, and reads its route once. A module
 * turned off goes with the tab's business, reads Modules once and marks the
 * shell's settings (the rail) stale, never a server render; a refusal reads
 * nothing. A customer email saved puts its answer in Integrations' cache
 * with no read; an answer in a shape it doesn't know reads the tab again.
 */
import type { QueryClient, QueryMeta } from "@tanstack/react-query";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
    refresh: vi.fn(),
    fetch: vi.fn(),
    setStatus: vi.fn(),
    impact: vi.fn(),
}));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: h.refresh, push: vi.fn(), replace: vi.fn() }),
    usePathname: () => "/settings/modules",
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/modules/actions", () => ({
    setModuleStatusAction: (...a: unknown[]) => h.setStatus(...a) as unknown,
    readModuleImpactAction: (...a: unknown[]) => h.impact(...a) as unknown,
}));
// The other tabs' Server Actions: never called here, kept off the server.
vi.mock("@/env", () => ({ env: { NEXT_PUBLIC_PLANS: "on" } }));
vi.mock("@/components/modules/turn-on/turn-on-sheet", () => ({
    TurnOnSheet: () => null,
}));
vi.mock("@saroh/ui/toast", () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
    showUndo: vi.fn(),
}));

import type { ModulesScreen } from "@/lib/modules/queries";
import { modulesRead } from "@/lib/modules/queries";
import type { ModuleView } from "@/lib/modules/schema";
import type { ProvidersScreen } from "@/lib/providers/queries";
import { providersRead } from "@/lib/providers/queries";
import { usePutCustomerEmails } from "@/lib/providers/use-providers";
import { getBrowserQueryClient } from "@/lib/query/client";
import { renderWithQuery } from "@/lib/query/test-utils";
import { billingRead } from "@/lib/saroh-billing/queries";
import { shellSettingsRead } from "@/lib/shell/queries";

import { BillingContainer } from "./billing-tab";
import { ModulesContainer } from "./modules-tab";
import { ProvidersContainer } from "./providers-tab";

const ORG = "org_1";
const INSIGHTS: ModuleView = {
    key: "INSIGHTS",
    label: "Insights",
    lifecycle: "ENABLED",
    readiness: "ACTIVE",
    selectedForProject: false,
    canManage: true,
    dependencies: [],
    blockers: [],
};
const MODULES: ModulesScreen = {
    modules: [{ ...INSIGHTS }],
    locks: null,
};
const EMAILS = {
    notices: [],
    canChange: true,
    emailConnected: true,
};

let unmount: (() => void) | undefined;
beforeEach(() => {
    for (const f of Object.values(h)) f.mockReset();
    h.impact.mockResolvedValue({ items: [], blockers: [] });
    vi.stubGlobal("fetch", h.fetch);
});
afterEach(() => {
    unmount?.();
    unmount = undefined;
    vi.unstubAllGlobals();
});

function hold(
    client: QueryClient,
    { queryKey, meta }: { queryKey: readonly unknown[]; meta?: QueryMeta },
    data: unknown,
) {
    client.getQueryCache().build(client, { queryKey, meta }).setData(data);
}
const readsOf = (path: string) =>
    h.fetch.mock.calls.filter(([url]) => String(url).includes(path)).length;
const stale = (client: QueryClient, key: readonly unknown[]) =>
    client.getQueryState(key)?.isInvalidated;
const answer = (data: unknown) =>
    Promise.resolve(
        new Response(JSON.stringify(data), {
            status: 200,
            headers: { "content-type": "application/json" },
        }),
    );
function fresh() {
    const client = getBrowserQueryClient();
    client.clear();
    return client;
}

describe("first paint", () => {
    it.each([
        ["Modules", <ModulesContainer key="m" />, "/api/modules"],
        ["Integrations", <ProvidersContainer key="p" />, "/api/providers"],
        [
            "Plan and billing",
            <BillingContainer key="b" />,
            "/api/settings/billing",
        ],
    ])(
        "%s: its title and the loader's pieces at once, no rows, one read",
        (title, ui, path) => {
            h.fetch.mockReturnValue(new Promise(() => undefined));
            const view = renderWithQuery(ui, { client: fresh(), orgId: ORG });
            unmount = view.unmount;
            expect(view.host.querySelector('[aria-busy="true"]')).not.toBe(
                null,
            );
            expect(view.host.textContent).toContain(title);
            expect(view.host.querySelector('[role="switch"]')).toBe(null);
            expect(readsOf(path)).toBe(1);
            expect(h.fetch).toHaveBeenCalledTimes(1);
        },
    );
});

describe("Modules", () => {
    function drawn() {
        const client = fresh();
        hold(client, modulesRead.options(ORG, {}), MODULES);
        hold(client, shellSettingsRead.options(ORG, {}), {});
        const view = renderWithQuery(<ModulesContainer />, {
            client,
            orgId: ORG,
        });
        unmount = view.unmount;
        return { client, host: view.host };
    }
    async function turnOff(host: HTMLElement) {
        const flip = () =>
            act(async () => {
                host.querySelector<HTMLButtonElement>(
                    '[role="switch"]',
                )?.click();
                await new Promise((r) => setTimeout(r, 0));
            });
        // Insights takes its row off the rail, so it asks; a second press is yes.
        await flip();
        await flip();
    }

    it("is drawn from the cache with no read", () => {
        const { host } = drawn();
        expect(host.querySelector('[role="switch"]')).not.toBe(null);
        expect(h.fetch).not.toHaveBeenCalled();
    });

    it("turning one off goes with the tab's business, reads Modules once and marks the rail's settings stale", async () => {
        h.setStatus.mockResolvedValue({ ok: true, data: INSIGHTS });
        h.fetch.mockImplementation(() => answer(MODULES));
        const { client, host } = drawn();
        await turnOff(host);
        expect(h.setStatus).toHaveBeenCalledWith(
            "INSIGHTS",
            "DISABLED",
            undefined,
            ORG,
        );
        expect(readsOf("/api/modules")).toBe(1);
        // The shell's settings (the rail) are read again where they show.
        expect(stale(client, shellSettingsRead.key(ORG, {}))).toBe(true);
        expect(h.refresh).not.toHaveBeenCalled();
    });

    it("a refusal reads nothing", async () => {
        h.setStatus.mockResolvedValue({ ok: false, error: "No." });
        const { client, host } = drawn();
        await turnOff(host);
        expect(h.setStatus).toHaveBeenCalledTimes(1);
        expect(h.fetch).not.toHaveBeenCalled();
        expect(stale(client, shellSettingsRead.key(ORG, {}))).toBe(false);
        expect(h.refresh).not.toHaveBeenCalled();
    });
});

describe("Integrations: a customer email saved", () => {
    function probe() {
        const client = fresh();
        hold(client, providersRead.options(ORG, {}), {
            customerEmails: null,
        });
        let put: ((next: unknown) => void) | undefined;
        function Probe() {
            put = usePutCustomerEmails();
            return null;
        }
        const view = renderWithQuery(<Probe />, { client, orgId: ORG });
        unmount = view.unmount;
        return { client, put: (n: unknown) => put?.(n) };
    }

    it("puts the answer in the tab's cache with no read", () => {
        const { client, put } = probe();
        act(() => put(EMAILS));
        expect(
            client.getQueryData<ProvidersScreen>(providersRead.key(ORG, {}))
                ?.customerEmails,
        ).toEqual(EMAILS);
        expect(h.fetch).not.toHaveBeenCalled();
    });

    it("an answer it doesn't know marks the tab stale instead", async () => {
        const { client, put } = probe();
        act(() => put({ secret: "x" }));
        await Promise.resolve();
        expect(stale(client, providersRead.key(ORG, {}))).toBe(true);
        expect(
            client.getQueryData<ProvidersScreen>(providersRead.key(ORG, {}))
                ?.customerEmails,
        ).toBe(null);
    });
});

describe("Plan and billing", () => {
    it("is held under Settings, so a Settings save reads it again", () => {
        expect(billingRead.key(ORG, {}).slice(0, 2)).toEqual(["settings", ORG]);
        expect(modulesRead.key(ORG, {}).slice(0, 2)).toEqual(["settings", ORG]);
        expect(providersRead.key(ORG, {}).slice(0, 2)).toEqual([
            "settings",
            ORG,
        ]);
    });
});
