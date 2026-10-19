/** @vitest-environment jsdom */
import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { cloneElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { flag, orgs } from "@/test/releases-fixture";

import FlagsRedirect from "@/app/flags/page";

import { ReleaseActions } from "./release-actions";
import { ReleaseHeader } from "./release-header";
import { ReleaseTable } from "./release-table";
import { WhoHasIt } from "./who-has-it";

const actions = vi.hoisted(() => ({
    setGlobalFlagAction: vi.fn(),
    setFlagOverrideAction: vi.fn(),
    clearFlagOverrideAction: vi.fn(),
}));
vi.mock("@/lib/flag-actions", () => actions);

const toast = vi.hoisted(() => ({
    showUndo: vi.fn(),
    showSuccess: vi.fn(),
    showError: vi.fn(),
    dismissToasts: vi.fn(),
}));
vi.mock("@saroh/ui/toast", () => toast);

const navigation = vi.hoisted(() => ({
    redirect: vi.fn((to: string) => {
        throw new Error(`NEXT_REDIRECT ${to}`);
    }),
    useRouter: () => ({ refresh: vi.fn() }),
    usePathname: () => "/releases",
}));
vi.mock("next/navigation", () => navigation);

// The ⋯ menus as plain buttons. Radix's own menu works in jsdom, but each
// close walks the page for something to focus through jsdom's
// getComputedStyle, which costs seconds a test; the browser specs open the
// real one.
vi.mock("@saroh/ui/dropdown-menu", async () => {
    const { createContext, useContext, useState } = await import("react");
    const Open = createContext<{ open: boolean; set: (o: boolean) => void }>({
        open: false,
        set: () => undefined,
    });
    return {
        DropdownMenu: ({ children }: { children: ReactNode }) => {
            const [open, set] = useState(false);
            return (
                <Open.Provider value={{ open, set }}>{children}</Open.Provider>
            );
        },
        DropdownMenuTrigger: ({
            children,
        }: {
            children: ReactElement<{ onClick?: () => void }>;
        }) => {
            const { open, set } = useContext(Open);
            return cloneElement(children, { onClick: () => set(!open) });
        },
        DropdownMenuContent: ({ children }: { children: ReactNode }) =>
            useContext(Open).open ? <div role="menu">{children}</div> : null,
        DropdownMenuItem: ({
            children,
            onSelect,
        }: {
            children: ReactNode;
            onSelect?: () => void;
        }) => {
            const { set } = useContext(Open);
            return (
                <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                        set(false);
                        onSelect?.();
                    }}
                >
                    {children}
                </button>
            );
        },
    };
});

vi.mock("next/link", () => ({
    default: ({
        href,
        children,
        scroll: _scroll,
        ...rest
    }: {
        href: string;
        children: ReactNode;
        scroll?: boolean;
    }) => (
        <a href={href} {...rest}>
            {children}
        </a>
    ),
}));

const payments = flag("MODULE_PAYMENTS", "Payments", "module", {
    enabledByDefault: false,
    overrides: [
        { organizationId: "o1", organizationName: "Org 1", enabled: true },
    ],
});
const shop = flag("SITE_SHOP", "Shop on your website", "feature");

beforeEach(() => {
    for (const fn of [...Object.values(actions), ...Object.values(toast)]) {
        fn.mockReset();
    }
    for (const fn of Object.values(actions)) {
        fn.mockResolvedValue({ ok: true, data: null });
    }
});
afterEach(cleanup);

async function openDialog(trigger: string) {
    fireEvent.click(screen.getByRole("button", { name: trigger }));
    return screen.findByRole("dialog");
}

/** Open a ⋯ menu and pick an item from it. */
function pickFromMenu(menu: string, item: string) {
    fireEvent.click(screen.getByRole("button", { name: menu }));
    fireEvent.click(screen.getByRole("menuitem", { name: item }));
    return screen.getByRole("dialog");
}

function chip(name: string) {
    return within(screen.getByRole("group", { name: "Show" })).getByRole(
        "button",
        { name: new RegExp(`^${name}`) },
    );
}

describe("ReleaseTable", () => {
    const everyone = flag("SITE_REVIEWS", "Reviews", "feature", {
        enabledByDefault: true,
        lastChange: { at: "2026-10-08T10:00:00Z", actorName: "Asha" },
    });
    const table = (flags = [shop, payments, everyone], canPublish = true) => (
        <ReleaseTable
            flags={flags}
            organizations={orgs(3)}
            canPublish={canPublish}
            today="2026-10-08"
        />
    );

    it("shows the name first, the code small below, the state, the count and the last change", () => {
        render(table());
        const row = screen
            .getByRole("link", { name: "Reviews" })
            .closest("li") as HTMLElement;
        const text = row.textContent;
        expect(text.indexOf("Reviews")).toBeLessThan(
            text.indexOf("SITE_REVIEWS"),
        );
        expect(
            screen.getByRole("link", { name: "Reviews" }).getAttribute("href"),
        ).toBe("/releases/SITE_REVIEWS");
        expect(within(row).getByText("On for everyone")).toBeTruthy();
        expect(within(row).getByText(/All 3 businesses/)).toBeTruthy();
        expect(within(row).getByText("by Asha")).toBeTruthy();

        const paymentsRow = screen
            .getByRole("link", { name: "Payments" })
            .closest("li") as HTMLElement;
        expect(within(paymentsRow).getByText("On for some")).toBeTruthy();
        expect(within(paymentsRow).getByText(/1 business/)).toBeTruthy();
        expect(within(paymentsRow).getByText("No changes yet")).toBeTruthy();
        // Modules come first.
        const names = screen
            .getAllByRole("link")
            .map((link) => link.textContent);
        expect(names).toEqual(["Payments", "Reviews", "Shop on your website"]);
    });

    it("filters by the chips, says when none match and clears", () => {
        render(table());
        expect(chip("All").getAttribute("aria-pressed")).toBe("true");

        fireEvent.click(chip("Off"));
        expect(chip("Off").getAttribute("aria-pressed")).toBe("true");
        expect(chip("All").getAttribute("aria-pressed")).toBe("false");
        expect(screen.getByRole("link", { name: "Shop on your website" }));
        expect(screen.queryByRole("link", { name: "Payments" })).toBeNull();
        expect(screen.queryByRole("link", { name: "Reviews" })).toBeNull();

        fireEvent.click(chip("On for some"));
        expect(screen.getByRole("link", { name: "Payments" })).toBeTruthy();
        expect(
            screen.queryByRole("link", { name: "Shop on your website" }),
        ).toBeNull();

        cleanup();
        render(table([shop]));
        fireEvent.click(chip("On for everyone"));
        expect(screen.getByText("No releases match")).toBeTruthy();
        const empty = screen
            .getByText("No releases match")
            .closest<HTMLElement>("[data-state]");
        if (!empty) throw new Error("no empty card");
        fireEvent.click(
            within(empty).getByRole("button", { name: "Clear filters" }),
        );
        expect(chip("All").getAttribute("aria-pressed")).toBe("true");
        expect(
            screen.getByRole("link", { name: "Shop on your website" }),
        ).toBeTruthy();
    });

    it("searches by the name businesses see and by the code name", async () => {
        render(table());
        const search = screen.getByRole("searchbox", {
            name: "Search releases",
        });
        fireEvent.change(search, { target: { value: "module_pay" } });
        await waitFor(() =>
            expect(screen.queryByRole("link", { name: "Reviews" })).toBeNull(),
        );
        expect(screen.getByRole("link", { name: "Payments" })).toBeTruthy();

        fireEvent.change(search, { target: { value: "nothing like it" } });
        await waitFor(() =>
            expect(
                screen.getByText("No releases match “nothing like it”"),
            ).toBeTruthy(),
        );
    });

    it("keeps a release turned on for some in place under Off, highlighted", async () => {
        const { rerender } = render(table());
        fireEvent.click(chip("Off"));
        const dialog = pickFromMenu(
            "More actions for Shop on your website",
            "Turn on for some…",
        );
        fireEvent.click(within(dialog).getByLabelText("Org 2"));
        fireEvent.click(
            within(dialog).getByRole("button", { name: "Rolling out" }),
        );
        fireEvent.click(
            within(dialog).getByRole("button", { name: "Turn on" }),
        );
        await waitFor(() =>
            expect(actions.setFlagOverrideAction).toHaveBeenCalledWith(
                "SITE_SHOP",
                "o2",
                true,
                "Rolling out",
                expect.any(String),
            ),
        );
        await waitFor(() => expect(toast.showUndo).toHaveBeenCalled());
        // The dialog's submit is an async transition that closes it after
        // the toast: a refresh drawn before it ends can wait on it, and the
        // row then still reads Off (a gate under load, 19 Oct 2026).
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

        // The refresh: Shop is now on for some, which Off would hide.
        const shopOn = {
            ...shop,
            enabledByDefault: false,
            overrides: [
                {
                    organizationId: "o2",
                    organizationName: "Org 2",
                    enabled: true,
                },
            ],
        };
        rerender(table([shopOn, payments, everyone]));
        const row = screen
            .getByRole("link", { name: "Shop on your website" })
            .closest("li") as HTMLElement;
        expect(row.hasAttribute("data-just-changed")).toBe(true);
        expect(within(row).getByText("On for some")).toBeTruthy();
        expect(chip("Off").getAttribute("aria-pressed")).toBe("true");

        // A new filter is the operator's say: the row goes.
        fireEvent.click(chip("All"));
        fireEvent.click(chip("Off"));
        expect(
            screen.queryByRole("link", { name: "Shop on your website" }),
        ).toBeNull();
    });

    it("offers no changes to someone who may not publish", () => {
        render(table(undefined, false));
        expect(
            screen.queryByRole("button", { name: /More actions/ }),
        ).toBeNull();
    });
});

describe("/flags", () => {
    it("sends an old link to the release it named, or to Releases", async () => {
        await expect(
            FlagsRedirect({
                searchParams: Promise.resolve({ release: "MODULE_PAYMENTS" }),
            }),
        ).rejects.toThrow("NEXT_REDIRECT /releases/MODULE_PAYMENTS");
        await expect(
            FlagsRedirect({
                searchParams: Promise.resolve({
                    flag: "MODULE_PAYMENTS",
                    organizationId: "o1",
                }),
            }),
        ).rejects.toThrow(
            "NEXT_REDIRECT /releases/MODULE_PAYMENTS/who?organizationId=o1",
        );
        await expect(
            FlagsRedirect({ searchParams: Promise.resolve({}) }),
        ).rejects.toThrow("NEXT_REDIRECT /releases");
    });
});

describe("ReleaseActions", () => {
    it("offers only the global change that applies, turning off under More actions", () => {
        const { rerender } = render(
            <ReleaseActions flag={payments} organizations={orgs(3)} />,
        );
        expect(
            screen.getByRole("button", { name: "Turn on for some…" }),
        ).toBeTruthy();
        expect(
            screen.getByRole("button", { name: "Turn on for everyone…" }),
        ).toBeTruthy();

        rerender(
            <ReleaseActions
                flag={{ ...payments, enabledByDefault: true, overrides: [] }}
                organizations={orgs(3)}
            />,
        );
        expect(
            screen.queryByRole("button", { name: "Turn on for everyone…" }),
        ).toBeNull();
        expect(
            screen.queryByRole("button", { name: "Turn on for some…" }),
        ).toBeNull();
        const dialog = pickFromMenu("More actions", "Turn off for everyone…");
        expect(dialog.textContent).toContain("3 businesses lose Payments.");
    });

    it("states the impact, fills a quick reason, sends it and offers Undo", async () => {
        render(<ReleaseActions flag={payments} organizations={orgs(3)} />);
        const dialog = await openDialog("Turn on for everyone…");
        expect(dialog.textContent).toContain(
            "1 business already has it; 2 more will get it.",
        );
        expect(dialog.textContent).toContain(
            "Each business still switches Payments on in its own Settings.",
        );

        fireEvent.click(
            within(dialog).getByRole("button", { name: "Rolling out" }),
        );
        const field = within(dialog).getByLabelText(/Why are you making/);
        expect((field as HTMLTextAreaElement).value).toBe("Rolling out");
        fireEvent.change(field, {
            target: { value: "Rolling out after beta" },
        });
        fireEvent.click(
            within(dialog).getByRole("button", {
                name: "Turn on for everyone",
            }),
        );

        await waitFor(() =>
            expect(actions.setGlobalFlagAction).toHaveBeenCalledWith(
                "MODULE_PAYMENTS",
                true,
                "Rolling out after beta",
                expect.any(String),
            ),
        );
        await waitFor(() => expect(toast.showUndo).toHaveBeenCalled());
        const [message, onUndo] = toast.showUndo.mock.calls[0] as [
            string,
            () => void,
        ];
        expect(message).toBe("Payments is on for everyone");

        onUndo();
        await waitFor(() =>
            expect(actions.setGlobalFlagAction).toHaveBeenLastCalledWith(
                "MODULE_PAYMENTS",
                false,
                "Undo: Rolling out after beta",
                expect.any(String),
            ),
        );
    });

    it("turns on for some businesses and names the ones that failed", async () => {
        actions.setFlagOverrideAction.mockImplementation(
            (_key: string, organizationId: string) =>
                Promise.resolve(
                    organizationId === "o3"
                        ? { ok: false, error: "Business is suspended." }
                        : { ok: true, data: null },
                ),
        );
        render(<ReleaseActions flag={payments} organizations={orgs(3)} />);
        const dialog = await openDialog("Turn on for some…");
        // Org 1 already has it, so it is not offered.
        expect(within(dialog).queryByLabelText("Org 1")).toBeNull();
        fireEvent.click(within(dialog).getByLabelText("Org 2"));
        fireEvent.click(within(dialog).getByLabelText("Org 3"));
        fireEvent.click(
            within(dialog).getByRole("button", {
                name: "Testing on a test business",
            }),
        );
        fireEvent.click(
            within(dialog).getByRole("button", { name: "Turn on" }),
        );

        const alert = await within(dialog).findByRole("alert");
        expect(alert.textContent).toContain("Turned on for Org 2.");
        expect(alert.textContent).toContain(
            "Didn't work for Org 3 (Business is suspended.)",
        );
        const keys = actions.setFlagOverrideAction.mock.calls.map(
            (call) => call[4] as string,
        );
        expect(new Set(keys).size).toBe(2);
        expect(toast.showUndo.mock.calls[0]?.[0]).toBe(
            "Payments is on for Org 2",
        );

        // Undo clears the setting Org 2 did not have before.
        (toast.showUndo.mock.calls[0]?.[1] as () => void)();
        await waitFor(() =>
            expect(actions.clearFlagOverrideAction).toHaveBeenCalledWith(
                "MODULE_PAYMENTS",
                "o2",
                "Undo: Testing on a test business",
                expect.any(String),
            ),
        );
    });
});

describe("ReleaseHeader", () => {
    it("shows the name businesses see, the code name, the state and the summary", () => {
        render(
            <ReleaseHeader
                flag={payments}
                organizations={orgs(2)}
                canPublish
            />,
        );
        expect(
            screen.getByRole("heading", { level: 1, name: "Payments" }),
        ).toBeTruthy();
        expect(screen.getByText("MODULE_PAYMENTS")).toBeTruthy();
        expect(screen.getByText("On for some")).toBeTruthy();
        expect(
            screen.getByText(
                "Off for everyone except 1 business turned on for them alone.",
            ),
        ).toBeTruthy();
        expect(
            screen.getByRole("link", { name: "Releases" }).getAttribute("href"),
        ).toBe("/releases");
        expect(
            screen.getByRole("button", { name: "More actions" }),
        ).toBeTruthy();
    });

    it("gives read-only staff no actions, and says why", () => {
        render(
            <ReleaseHeader
                flag={payments}
                organizations={orgs(2)}
                canPublish={false}
            />,
        );
        expect(screen.queryByRole("button", { name: /Turn / })).toBeNull();
        expect(
            screen.queryByRole("button", { name: "More actions" }),
        ).toBeNull();
        expect(
            screen.getByText(/your role doesn't include turning releases/),
        ).toBeTruthy();
    });
});

describe("WhoHasIt", () => {
    it("says why each business has it and marks a leftover setting", async () => {
        const f = {
            ...payments,
            enabledByDefault: true,
            overrides: [
                {
                    organizationId: "o1",
                    organizationName: "Org 1",
                    enabled: true,
                },
                {
                    organizationId: "o2",
                    organizationName: "Org 2",
                    enabled: false,
                },
            ],
        };
        render(
            <WhoHasIt
                flag={f}
                organizations={orgs(3)}
                canPublish
                explained={{
                    organizationId: "o3",
                    explanation: { value: true, source: "DEFAULT" },
                }}
            />,
        );
        expect(
            screen.getByText(
                "turned on for this business · same as the default",
            ),
        ).toBeTruthy();
        expect(screen.getByText("turned off for this business")).toBeTruthy();
        expect(screen.getByText("follows the default")).toBeTruthy();
        // Each name opens the business.
        expect(
            screen.getByRole("link", { name: "Org 3" }).getAttribute("href"),
        ).toBe("/businesses/o3");
        // One label for the way back to the default.
        expect(
            screen.getAllByRole("button", { name: "Use the default…" }),
        ).toHaveLength(2);
        expect(screen.getByRole("status").textContent).toContain(
            "Org 3 has Payments on because that is the default for everyone",
        );

        const [useDefault] = screen.getAllByRole("button", {
            name: "Use the default…",
        });
        fireEvent.click(useDefault);
        const dialog = await screen.findByRole("dialog");
        fireEvent.change(within(dialog).getByLabelText(/Why are you making/), {
            target: { value: "Cleaning up a leftover" },
        });
        fireEvent.click(
            within(dialog).getByRole("button", { name: "Use the default" }),
        );
        await waitFor(() =>
            expect(actions.clearFlagOverrideAction).toHaveBeenCalledWith(
                "MODULE_PAYMENTS",
                "o1",
                "Cleaning up a leftover",
                expect.any(String),
            ),
        );
    });

    it("searches businesses", () => {
        render(
            <WhoHasIt
                flag={payments}
                organizations={orgs(3)}
                canPublish={false}
                explained={null}
            />,
        );
        fireEvent.change(screen.getByLabelText("Search businesses"), {
            target: { value: "org 2" },
        });
        expect(screen.queryByText("Org 1")).toBeNull();
        expect(screen.getByText("Org 2")).toBeTruthy();
    });
});
