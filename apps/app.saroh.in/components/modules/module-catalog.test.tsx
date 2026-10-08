// @vitest-environment jsdom
/**
 * Settings › Modules shows only what Saroh has rolled out (DEC-057): a
 * module whose rollout is off is not on the screen at all, one that is on
 * is, and a refused switch never puts a raw code in front of a merchant.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BLOCKER_COPY } from "@/lib/modules/blocker-copy";
import type { ModuleView } from "@/lib/modules/schema";

import { ModuleCatalog } from "./module-catalog";

vi.mock("@/components/modules/turn-on/turn-on-sheet", () => ({
    TurnOnSheet: () => null,
}));

const setModuleStatusAction = vi.fn();
const readModuleImpactAction = vi.fn();
vi.mock("@/lib/modules/actions", () => ({
    setModuleStatusAction: (...args: unknown[]) =>
        setModuleStatusAction(...args) as unknown,
    readModuleImpactAction: (...args: unknown[]) =>
        readModuleImpactAction(...args) as unknown,
}));

const showError = vi.fn();
vi.mock("@saroh/ui/toast", () => ({
    showSuccess: vi.fn(),
    showError: (message: string) => showError(message) as unknown,
    showUndo: vi.fn(),
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
    usePathname: () => "/settings/modules",
}));

function view(key: string, over: Partial<ModuleView> = {}): ModuleView {
    return {
        key,
        label: key,
        lifecycle: "DISABLED",
        readiness: "DISABLED",
        selectedForProject: false,
        canManage: true,
        dependencies: [],
        blockers: [],
        ...over,
    };
}
const dark = [{ code: "ROLLOUT_DISABLED" }];

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    setModuleStatusAction.mockReset();
    readModuleImpactAction.mockReset();
    readModuleImpactAction.mockResolvedValue(null);
    showError.mockReset();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
});

function switchFor(label: string): HTMLButtonElement | undefined {
    return Array.from(
        document.querySelectorAll<HTMLButtonElement>('[role="switch"]'),
    ).find((s) => {
        const [id] = (s.getAttribute("aria-labelledby") ?? "").split(" ");
        return id ? document.getElementById(id)?.textContent === label : false;
    });
}

describe("Settings › Modules (DEC-057)", () => {
    it("hides a module Saroh has switched off, and shows one that is on", () => {
        act(() =>
            root.render(
                <ModuleCatalog
                    modules={[
                        view("COMMERCE", {
                            lifecycle: "ENABLED",
                            readiness: "ACTIVE",
                        }),
                        view("WEBSITE", { blockers: dark }),
                        view("CRM"),
                    ]}
                />,
            ),
        );
        expect(switchFor("Sell")).toBeDefined();
        expect(switchFor("Contacts")).toBeDefined();
        expect(switchFor("WEBSITE")).toBeUndefined();
        expect(document.body.textContent).not.toMatch(/Website|Pages, posts/);
        expect(document.body.textContent).not.toMatch(/ROLLOUT_DISABLED/);
    });

    it("hides a module that is on for the business but switched off by Saroh", () => {
        act(() =>
            root.render(
                <ModuleCatalog
                    modules={[
                        view("COMMERCE", {
                            lifecycle: "ENABLED",
                            readiness: "ACTIVE",
                        }),
                        view("WEBSITE", {
                            lifecycle: "ENABLED",
                            readiness: "DISABLED",
                            blockers: dark,
                        }),
                    ]}
                />,
            ),
        );
        expect(document.querySelectorAll('[role="switch"]')).toHaveLength(1);
        expect(document.body.textContent).not.toMatch(/ROLLOUT_DISABLED/);
    });

    it("says it plainly when nothing is rolled out, with no code", () => {
        act(() =>
            root.render(
                <ModuleCatalog
                    modules={[view("WEBSITE", { blockers: dark })]}
                />,
            ),
        );
        expect(document.body.textContent).toMatch(/No modules to show/);
        expect(document.body.textContent).not.toMatch(/ROLLOUT_DISABLED/);
    });

    it.each([
        ["a bare code", "ROLLOUT_DISABLED", BLOCKER_COPY.ROLLOUT_DISABLED],
        [
            "a permission key",
            'Role "MEMBER" may not perform "module:manage"',
            BLOCKER_COPY.UNAUTHORIZED,
        ],
    ])("never toasts %s when the API refuses", async (_, error, said) => {
        setModuleStatusAction.mockResolvedValue({ ok: false, error });
        act(() =>
            root.render(
                <ModuleCatalog
                    modules={[
                        view("COMMERCE", {
                            lifecycle: "ENABLED",
                            readiness: "ACTIVE",
                        }),
                    ]}
                />,
            ),
        );
        // Sell takes Orders and Products off the rail, so it asks first;
        // "Turn off" is the answer.
        await act(async () => {
            switchFor("Sell")?.click();
            await Promise.resolve();
        });
        const turnOff = Array.from(document.querySelectorAll("button")).find(
            (b) => b.textContent === "Turn off",
        );
        await act(async () => {
            turnOff?.click();
            await Promise.resolve();
        });
        expect(setModuleStatusAction).toHaveBeenCalledWith(
            "COMMERCE",
            "DISABLED",
        );
        expect(showError).toHaveBeenCalledWith(said);
        expect(showError.mock.calls.flat().join(" ")).not.toMatch(
            /ROLLOUT_DISABLED|module:manage/,
        );
    });
});

describe("Settings › Modules on a plan that won't let it connect (UX-006, UX-017)", () => {
    const lock = {
        comesWith: "Comes with Grow",
        cta: "See Grow",
        href: "/settings/billing?plan=grow#change-plan",
        upgrade: "Grow",
        full: false,
    };
    const on = (key: string, over: Partial<ModuleView> = {}) =>
        view(key, { lifecycle: "ENABLED", readiness: "ACTIVE", ...over });
    const comms = on("COMMUNICATIONS", {
        readiness: "SETUP_REQUIRED",
        blockers: [
            {
                code: "COMMUNICATIONS_NO_PROVIDER",
                actionHref: "/settings/providers",
            },
        ],
    });

    it("Free: Payments says it is offline and the plan; Communications isn't Finish setup", () => {
        act(() =>
            root.render(
                <ModuleCatalog
                    modules={[on("PAYMENTS"), comms]}
                    locks={{ payments: lock, messaging: lock }}
                />,
            ),
        );
        const text = host.textContent;
        expect(text).toContain(
            "Taking payment online comes with Grow. Until then, customers pay you the ways you set in How to pay us.",
        );
        expect(text).toContain("Connecting your own email comes with Grow.");
        expect(text).not.toContain("Finish setup");
        expect(text).not.toContain("Connect a provider to send messages.");
        expect(
            host.querySelectorAll(
                'a[href="/settings/billing?plan=grow#change-plan"]',
            ),
        ).toHaveLength(2);
        expect(host.querySelector('a[href="/settings/providers"]')).toBeNull();
    });

    it("Grow: Communications still asks to connect, Payments says nothing of plans", () => {
        act(() =>
            root.render(
                <ModuleCatalog
                    modules={[on("PAYMENTS"), comms]}
                    locks={{ payments: null, messaging: null }}
                />,
            ),
        );
        const text = host.textContent;
        expect(text).toContain("Finish setup");
        expect(text).not.toContain("comes with Grow");
    });
});
