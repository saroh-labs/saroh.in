// @vitest-environment jsdom
/**
 * Settings' first tabs on React Query (DEC-259), in the browser: a tab is
 * drawn from the cache when the address names it, with no read while it is
 * held (a `settings` read); with nothing held, the frame and the loader's
 * pieces at once and one read. A save reads the tab shown once, marks the
 * others and (for a role or membership) the business list stale, and never
 * draws the page again (`router.refresh()`); an alert saved lands in the
 * cache from the action's answer, with the tab's business, and a refused
 * one reads nothing.
 */
import type { QueryClient, QueryMeta } from "@tanstack/react-query";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
    refresh: vi.fn(),
    pathname: "/settings/people",
    fetch: vi.fn(),
    saveAlert: vi.fn(),
}));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: h.refresh, push: vi.fn(), replace: vi.fn() }),
    usePathname: () => h.pathname,
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/data-export/actions", () => ({}));
vi.mock("@/lib/notifications/actions", () => ({
    saveAlert: (...a: unknown[]) => h.saveAlert(...a) as unknown,
    undoAlert: vi.fn(),
}));
// The tabs' own drawing is tested with each; here, what they are given.
vi.mock("@/components/organizations/team/team-screen", () => ({
    TeamScreen: ({ organizationName }: { organizationName: string }) => (
        <p data-team="">{organizationName}</p>
    ),
}));
vi.mock("@/components/settings/profile/your-profile", async () => {
    const { AlertsGrid } =
        await import("@/components/settings/profile/alerts-grid");
    return {
        YourProfile: (p: {
            alerts: AlertPreferencesRead;
            save: {
                orgId: string;
                alerts: (x: AlertPreferences) => void;
            };
        }) => (
            <AlertsGrid
                read={p.alerts}
                save={{ orgId: p.save.orgId, saved: p.save.alerts }}
            />
        ),
    };
});
// Modules, Integrations and Plan and billing are tested in `tabs/`.
vi.mock("./tabs/modules-tab", () => ({
    ModulesContainer: () => <p data-tab="modules" />,
}));
vi.mock("./tabs/providers-tab", () => ({
    ProvidersContainer: () => <p data-tab="integrations" />,
}));
vi.mock("./tabs/billing-tab", () => ({
    BillingContainer: () => <p data-tab="billing" />,
}));
vi.mock("@/components/settings/page/settings-panel", () => ({
    SettingsPanel: ({ children }: { children: React.ReactNode }) => (
        <div>{children}</div>
    ),
    SettingsPanelHeader: () => null,
}));
vi.mock(
    "@/components/organizations/business-settings/organization-settings-form",
    () => ({ OrganizationSettingsForm: () => null }),
);
vi.mock("@/components/organizations/web-address/web-address-section", () => ({
    WebAddressSection: () => null,
}));
vi.mock("@/components/settings/ready/ready-checklist", () => ({
    ReadyChecklist: () => null,
    readyHasCard: () => false,
}));
vi.mock(
    "@/components/organizations/business-settings/use-settings-undo",
    () => ({ useSettingsUndo: () => ({ offer: vi.fn(), settle: vi.fn() }) }),
);

import type {
    AlertPreferences,
    AlertPreferencesRead,
} from "@/lib/notifications/preferences";
import { getBrowserQueryClient } from "@/lib/query/client";
import { ORGANIZATIONS_KEY } from "@/lib/query/keys";
import { renderWithQuery } from "@/lib/query/test-utils";
import type { PeopleScreen, ProfileScreen } from "@/lib/settings/queries";
import { peopleRead, profileRead } from "@/lib/settings/queries";
import type { SettingsSave } from "@/lib/settings/use-settings";
import { useSettingsSave } from "@/lib/settings/use-settings";
import { shellLiveRead, shellSettingsRead } from "@/lib/shell/queries";

import { SettingsTabScreen } from "./settings-tab-screen";

const ORG = "org_1";
const PEOPLE = { organizationName: "Rye", limitNotice: null } as PeopleScreen;
const prefs = (on: boolean): AlertPreferences => ({
    alerts: [
        { key: "order", channels: { bell: on, email: false, whatsapp: false } },
    ],
    channels: {
        bell: { available: true },
        email: { available: true },
        whatsapp: { available: false, reason: "NO_PROVIDER" },
    },
    canConnect: true,
});
const PROFILE = {
    name: "Asha",
    email: "asha@example.com",
    accountUrl: "https://accounts.saroh.localhost/account",
    alerts: { status: "ok", prefs: prefs(true) },
    mine: null,
    leave: null,
} as ProfileScreen;

let unmount: (() => void) | undefined;
beforeEach(() => {
    h.refresh.mockReset();
    h.fetch.mockReset();
    h.saveAlert.mockReset();
    h.pathname = "/settings/people";
    vi.stubGlobal("fetch", h.fetch);
});
afterEach(() => {
    unmount?.();
    vi.unstubAllGlobals();
});

/** Held as its read holds it: with its options (its tier), not bare data. */
function hold(
    client: QueryClient,
    { queryKey, meta }: { queryKey: readonly unknown[]; meta?: QueryMeta },
    data: unknown,
) {
    client.getQueryCache().build(client, { queryKey, meta }).setData(data);
}

function seeded() {
    // The browser's one client, as the shell's provider uses: the business
    // list's writers mark it there.
    const client = getBrowserQueryClient();
    client.clear();
    hold(client, peopleRead.options(ORG, {}), PEOPLE);
    hold(client, profileRead.options(ORG, {}), PROFILE);
    client.setQueryData(ORGANIZATIONS_KEY, []);
    return client;
}

const shown = (client: ReturnType<typeof seeded>, key: readonly unknown[]) =>
    client.getQueryState(key)?.isInvalidated;
const readsOf = (path: string) =>
    h.fetch.mock.calls.filter(([url]) => String(url).includes(path)).length;
const answer = (data: unknown) =>
    Promise.resolve(
        new Response(JSON.stringify(data), {
            status: 200,
            headers: { "content-type": "application/json" },
        }),
    );

describe("Settings tabs on React Query", () => {
    it("draws the frame and the loader's pieces at once, with no rows, and reads the tab once", () => {
        const client = getBrowserQueryClient();
        client.clear();
        // Never answers: the first paint is what is drawn.
        h.fetch.mockReturnValue(new Promise(() => undefined));
        h.pathname = "/settings/organization";
        const view = renderWithQuery(
            <SettingsTabScreen tab="/settings/organization" kind="SOLO" />,
            { client, orgId: ORG },
        );
        unmount = view.unmount;
        expect(view.host.querySelector('[aria-busy="true"]')).not.toBe(null);
        // The title is the gate's, not a bar.
        expect(view.host.textContent).toContain("Your details");
        expect(view.host.querySelector("[data-team]")).toBe(null);
        expect(readsOf("/api/settings/people")).toBe(0);
        expect(h.fetch).toHaveBeenCalledTimes(1);
    });

    it("draws the tab the address names from the cache, with no read", () => {
        const client = seeded();
        const view = renderWithQuery(
            <SettingsTabScreen tab="/settings/profile" kind={null} />,
            { client, orgId: ORG },
        );
        unmount = view.unmount;
        expect(view.host.querySelector("[data-team]")?.textContent).toBe("Rye");
        expect(h.fetch).not.toHaveBeenCalled();
    });

    it("a role save reads the tab shown once, marks the others and the business list stale, and draws nothing again", async () => {
        const client = seeded();
        h.fetch.mockImplementation(() => answer(PEOPLE));
        let save: SettingsSave | undefined;
        function Probe() {
            save = useSettingsSave();
            return null;
        }
        const view = renderWithQuery(
            <>
                <SettingsTabScreen tab="/settings/people" kind={null} />
                <Probe />
            </>,
            { client, orgId: ORG },
        );
        unmount = view.unmount;
        expect(save?.orgId).toBe(ORG);
        await act(async () => {
            save?.saved({ organizations: true });
            await new Promise((r) => setTimeout(r, 0));
        });
        expect(readsOf("/api/settings/people")).toBe(1);
        expect(readsOf("/api/settings/profile")).toBe(0);
        expect(shown(client, profileRead.key(ORG, {}))).toBe(true);
        expect(shown(client, ORGANIZATIONS_KEY)).toBe(true);
        expect(h.fetch).toHaveBeenCalledTimes(1);
        expect(h.refresh).not.toHaveBeenCalled();
    });

    it("a save the shell draws marks the shell's settings stale too", async () => {
        const client = seeded();
        const shell = shellSettingsRead.key(ORG, {});
        hold(client, shellSettingsRead.options(ORG, {}), {});
        let save: SettingsSave | undefined;
        function Probe() {
            save = useSettingsSave();
            return null;
        }
        const view = renderWithQuery(<Probe />, { client, orgId: ORG });
        unmount = view.unmount;
        act(() => save?.saved({ shell: true }));
        await Promise.resolve();
        expect(shown(client, shell)).toBe(true);
        expect(shown(client, peopleRead.key(ORG, {}))).toBe(true);
        expect(shown(client, ORGANIZATIONS_KEY)).toBe(false);
        expect(h.fetch).not.toHaveBeenCalled();
        expect(h.refresh).not.toHaveBeenCalled();
    });

    it("an alert saved goes to the action with the tab's business, and its answer into the cache", async () => {
        h.pathname = "/settings/profile";
        h.saveAlert.mockResolvedValue({ ok: true, data: prefs(false) });
        const client = seeded();
        const bell = shellLiveRead.key(ORG, {});
        client.setQueryData(bell, { unread: 0, counts: {} });
        const view = renderWithQuery(
            <SettingsTabScreen tab="/settings/profile" kind={null} />,
            { client, orgId: ORG },
        );
        unmount = view.unmount;
        const toggle = view.host.querySelector<HTMLButtonElement>(
            'button[role="switch"]:not([disabled])',
        );
        expect(toggle?.getAttribute("aria-checked")).toBe("true");
        await act(async () => {
            toggle?.click();
            await Promise.resolve();
        });
        expect(h.saveAlert).toHaveBeenCalledWith(
            { alert: "order", channel: "bell", on: false },
            ORG,
        );
        expect(client.getQueryData(profileRead.key(ORG, {}))).toMatchObject({
            alerts: { status: "ok", prefs: prefs(false) },
        });
        expect(toggle?.getAttribute("aria-checked")).toBe("false");
        // The bell counts what you hear about: marked, read where it shows.
        expect(shown(client, bell)).toBe(true);
        expect(shown(client, profileRead.key(ORG, {}))).toBe(false);
        expect(h.refresh).not.toHaveBeenCalled();
        expect(h.fetch).not.toHaveBeenCalled();
    });

    it("a refused alert reads nothing and keeps what was held", async () => {
        h.pathname = "/settings/profile";
        h.saveAlert.mockResolvedValue({ ok: false, error: "No." });
        const client = seeded();
        const view = renderWithQuery(
            <SettingsTabScreen tab="/settings/profile" kind={null} />,
            { client, orgId: ORG },
        );
        unmount = view.unmount;
        const toggle = view.host.querySelector<HTMLButtonElement>(
            'button[role="switch"]:not([disabled])',
        );
        await act(async () => {
            toggle?.click();
            await Promise.resolve();
        });
        expect(client.getQueryData(profileRead.key(ORG, {}))).toEqual(PROFILE);
        expect(toggle?.getAttribute("aria-checked")).toBe("true");
        expect(h.fetch).not.toHaveBeenCalled();
        expect(h.refresh).not.toHaveBeenCalled();
    });
});
