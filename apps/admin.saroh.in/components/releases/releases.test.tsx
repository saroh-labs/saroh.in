/** @vitest-environment jsdom */
import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { flag, orgs } from "@/test/releases-fixture";

import { ReleaseActions } from "./release-actions";
import { ReleaseDetail } from "./release-detail";
import { ReleaseList } from "./release-list";
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

describe("ReleaseList", () => {
    it("groups releases and searches by key and by the name businesses see", () => {
        render(
            <ReleaseList
                flags={[shop, payments]}
                selectedKey="MODULE_PAYMENTS"
                today="2026-10-08"
            />,
        );
        expect(screen.getByRole("heading", { name: "Modules" })).toBeTruthy();
        expect(screen.getByRole("heading", { name: "Features" })).toBeTruthy();
        expect(screen.getByText("On for 1")).toBeTruthy();
        expect(screen.getByText("Never switched on")).toBeTruthy();

        const search = screen.getByLabelText("Search releases");
        fireEvent.change(search, { target: { value: "shop on your" } });
        expect(screen.queryByText("MODULE_PAYMENTS")).toBeNull();
        expect(screen.getByText("SITE_SHOP")).toBeTruthy();

        fireEvent.change(search, { target: { value: "module_pay" } });
        expect(screen.getByText("MODULE_PAYMENTS")).toBeTruthy();
        expect(screen.queryByText("SITE_SHOP")).toBeNull();
    });

    it("links each row by URL and marks an overdue review", () => {
        render(
            <ReleaseList
                flags={[payments]}
                selectedKey="MODULE_PAYMENTS"
                today="2027-05-01"
            />,
        );
        const link = screen.getByRole("link", { name: /MODULE_PAYMENTS/ });
        expect(link.getAttribute("href")).toBe(
            "/flags?release=MODULE_PAYMENTS",
        );
        expect(link.getAttribute("aria-current")).toBe("page");
        expect(screen.getByText("Review overdue")).toBeTruthy();
    });
});

describe("ReleaseActions", () => {
    it("offers only the global change that applies", () => {
        const { rerender } = render(
            <ReleaseActions flag={payments} organizations={orgs(3)} />,
        );
        expect(
            screen.getByRole("button", { name: "Turn on for everyone…" }),
        ).toBeTruthy();
        expect(
            screen.queryByRole("button", { name: "Turn off for everyone…" }),
        ).toBeNull();

        rerender(
            <ReleaseActions
                flag={{ ...payments, enabledByDefault: true }}
                organizations={orgs(3)}
            />,
        );
        expect(
            screen.getByRole("button", { name: "Turn off for everyone…" }),
        ).toBeTruthy();
        expect(
            screen.queryByRole("button", { name: "Turn on for everyone…" }),
        ).toBeNull();
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
        const dialog = await openDialog("Turn on for some businesses…");
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

describe("ReleaseDetail", () => {
    it("shows the key, the name businesses see and the summary", () => {
        render(
            <ReleaseDetail
                flag={payments}
                organizations={orgs(2)}
                history={[]}
                canPublish
                explained={null}
                today="2026-10-08"
            />,
        );
        expect(
            screen.getByRole("heading", { name: "MODULE_PAYMENTS" }),
        ).toBeTruthy();
        expect(screen.getByText("Shown to businesses as:")).toBeTruthy();
        expect(
            screen.getByText(
                "Off for everyone, on for 1 business set on their own.",
            ),
        ).toBeTruthy();
    });

    it("gives read-only staff no actions, and says why", () => {
        render(
            <ReleaseDetail
                flag={payments}
                organizations={orgs(2)}
                history={[]}
                canPublish={false}
                explained={null}
                today="2026-10-08"
            />,
        );
        expect(screen.queryByRole("button", { name: /Turn / })).toBeNull();
        expect(
            screen.queryByRole("button", { name: "Use everyone's default" }),
        ).toBeNull();
        expect(
            screen.getByText(/your role does not include release publishing/),
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
            screen.getByText("set for this business · same as default"),
        ).toBeTruthy();
        expect(screen.getByText("set for this business")).toBeTruthy();
        expect(screen.getByText("everyone's default")).toBeTruthy();
        expect(screen.getByRole("status").textContent).toContain(
            "Org 3 has Payments on because that is the default for everyone",
        );

        const dialog = await openDialog("Remove");
        fireEvent.change(within(dialog).getByLabelText(/Why are you making/), {
            target: { value: "Cleaning up a leftover" },
        });
        fireEvent.click(
            within(dialog).getByRole("button", {
                name: "Use everyone's default",
            }),
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
