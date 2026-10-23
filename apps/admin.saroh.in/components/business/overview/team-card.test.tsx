/** @vitest-environment jsdom */
import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import type { AnchorHTMLAttributes } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
    showUndo: vi.fn(),
    dismissToasts: vi.fn(),
}));
const actions = vi.hoisted(() => ({
    managerCandidatesAction: vi.fn(),
    assignManagerAction: vi.fn(),
    endManagerAction: vi.fn(),
}));

vi.mock("next/link", () => ({
    default: ({
        href,
        children,
        ...rest
    }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
        <a href={href} {...rest}>
            {children}
        </a>
    ),
}));
vi.mock("@/lib/account-manager-actions", () => actions);
vi.mock("@saroh/ui/toast", () => toast);

import type {
    OverviewAccountManager,
    OverviewManager,
    OverviewPanel,
    OverviewTeam,
} from "@/lib/overview-words";

import { TeamCard } from "./team-card";

// Made-up people: nobody here is real.
const team: OverviewPanel<OverviewTeam> = {
    status: "ok",
    data: {
        members: [{ name: "Rhea", role: "OWNER" }],
        count: 1,
        invitesOpen: 0,
    },
};

const asha: OverviewManager = {
    platformAdminId: "pa_asha",
    name: "Asha",
    kind: "BROUGHT_IN",
    source: "LINK",
    since: "2026-10-03T06:00:00.000Z",
};

const withManager = (
    manager: OverviewManager | null,
): OverviewPanel<OverviewAccountManager> => ({
    status: "ok",
    data: { manager },
});

const card = () => {
    const el = document.querySelector('[data-overview-card="team"]');
    if (!el) throw new Error("no team card");
    return within(el as HTMLElement);
};

const candidates = [
    {
        platformAdminId: "pa_vikram",
        name: "Vikram",
        businesses: 2,
        capacity: 10,
        current: false,
    },
    {
        platformAdminId: "pa_asha",
        name: "Asha",
        businesses: 5,
        capacity: null,
        current: true,
    },
];

beforeEach(() => {
    vi.clearAllMocks();
    actions.managerCandidatesAction.mockResolvedValue({
        ok: true,
        data: candidates,
    });
});
afterEach(cleanup);

describe("the Team card's account manager (U25)", () => {
    it("shows the manager, how they came and since when", () => {
        render(
            <TeamCard
                organizationId="org_1"
                team={team}
                accountManager={withManager(asha)}
                canAssign={false}
            />,
        );
        expect(card().getByText("Asha")).toBeTruthy();
        expect(
            card().getByText(/^Brought in through their link · since/),
        ).toBeTruthy();
        // Without accounts:assign, nothing to press; the people stay.
        expect(card().queryByRole("button")).toBeNull();
        expect(card().getByText("Rhea")).toBeTruthy();
        expect(card().getByRole("link", { name: "Open Team" })).toBeTruthy();
    });

    it("says when nobody looks after it, and offers Assign… only to those who may", () => {
        const { rerender } = render(
            <TeamCard
                organizationId="org_1"
                team={team}
                accountManager={withManager(null)}
                canAssign={false}
            />,
        );
        expect(card().getByText("No account manager")).toBeTruthy();
        expect(card().queryByRole("button", { name: "Assign…" })).toBeNull();
        rerender(
            <TeamCard
                organizationId="org_1"
                team={team}
                accountManager={withManager(null)}
                canAssign
            />,
        );
        expect(card().getByRole("button", { name: "Assign…" })).toBeTruthy();
        expect(card().queryByRole("button", { name: "End…" })).toBeNull();
    });

    it("assigns from the picker with a reason, and lights the card", async () => {
        actions.assignManagerAction.mockResolvedValue({
            ok: true,
            data: {
                manager: { ...asha, name: "Vikram", kind: "ASSIGNED" },
                previous: null,
            },
        });
        render(
            <TeamCard
                organizationId="org_1"
                team={team}
                accountManager={withManager(null)}
                canAssign
            />,
        );
        fireEvent.click(card().getByRole("button", { name: "Assign…" }));
        const dialog = await screen.findByRole("dialog");
        const picker = await within(dialog).findByRole("combobox");
        // Fewest first, with the load against capacity.
        expect(
            within(picker)
                .getAllByRole("option")
                .map((o) => o.textContent),
        ).toEqual(["Vikram · 2 of 10 businesses", "Asha · 5 businesses"]);
        fireEvent.change(within(dialog).getByRole("textbox"), {
            target: { value: "Vikram covers Pune" },
        });
        fireEvent.click(
            within(dialog).getByRole("button", {
                name: "Assign account manager",
            }),
        );
        await waitFor(() =>
            expect(actions.assignManagerAction).toHaveBeenCalledWith("org_1", {
                platformAdminId: "pa_vikram",
                reason: "Vikram covers Pune",
                idempotencyKey: expect.any(String) as unknown,
            }),
        );
        await waitFor(() =>
            expect(toast.showSuccess).toHaveBeenCalledWith(
                "Vikram now looks after this business.",
                expect.any(String),
            ),
        );
        expect(
            document
                .querySelector('[data-overview-card="team"]')
                ?.hasAttribute("data-just-changed"),
        ).toBe(true);
    });

    it("Change… leaves out who has it now, and says a brought-in link ends for good", async () => {
        render(
            <TeamCard
                organizationId="org_1"
                team={team}
                accountManager={withManager(asha)}
                canAssign
            />,
        );
        fireEvent.click(card().getByRole("button", { name: "Change…" }));
        const dialog = await screen.findByRole("dialog");
        expect(
            within(dialog).getByText(/Asha brought this business in/),
        ).toBeTruthy();
        const picker = await within(dialog).findByRole("combobox");
        expect(
            within(picker)
                .getAllByRole("option")
                .map((o) => o.textContent),
        ).toEqual(["Vikram · 2 of 10 businesses"]);
    });

    it("End… asks a reason and shows the API's refusal in place", async () => {
        actions.endManagerAction.mockResolvedValue({
            ok: false,
            error: "This business has no account manager to end.",
        });
        render(
            <TeamCard
                organizationId="org_1"
                team={team}
                accountManager={withManager(asha)}
                canAssign
            />,
        );
        fireEvent.click(card().getByRole("button", { name: "End…" }));
        const dialog = await screen.findByRole("dialog");
        const submit = within(dialog).getByRole("button", {
            name: "End the link",
        });
        expect((submit as HTMLButtonElement).disabled).toBe(true);
        fireEvent.change(within(dialog).getByRole("textbox"), {
            target: { value: "Owner asked" },
        });
        fireEvent.click(submit);
        expect(
            await within(dialog).findByText(
                "This business has no account manager to end.",
            ),
        ).toBeTruthy();
        expect(toast.showSuccess).not.toHaveBeenCalled();
    });

    it("says when the picker couldn't load, and when nobody else has the role", async () => {
        actions.managerCandidatesAction.mockResolvedValueOnce({
            ok: false,
            error: "Could not list the account managers.",
        });
        render(
            <TeamCard
                organizationId="org_1"
                team={team}
                accountManager={withManager(null)}
                canAssign
            />,
        );
        fireEvent.click(card().getByRole("button", { name: "Assign…" }));
        expect(
            await screen.findByText("Could not list the account managers."),
        ).toBeTruthy();
        cleanup();

        actions.managerCandidatesAction.mockResolvedValueOnce({
            ok: true,
            data: [{ ...candidates[1] }],
        });
        render(
            <TeamCard
                organizationId="org_1"
                team={team}
                accountManager={withManager(asha)}
                canAssign
            />,
        );
        fireEvent.click(card().getByRole("button", { name: "Change…" }));
        expect(
            await screen.findByText(
                /Nobody else holds the Account manager role/,
            ),
        ).toBeTruthy();
    });

    it("keeps the manager when the people fail to load, and the people when the manager does", () => {
        render(
            <TeamCard
                organizationId="org_1"
                team={{ status: "failed" }}
                accountManager={withManager(asha)}
                canAssign={false}
            />,
        );
        expect(card().getByText("Asha")).toBeTruthy();
        expect(card().getByText(/Couldn't load team members/)).toBeTruthy();
        cleanup();
        render(
            <TeamCard
                organizationId="org_1"
                team={team}
                accountManager={{ status: "failed" }}
                canAssign
            />,
        );
        expect(
            card().getByText(/Couldn't load the account manager/),
        ).toBeTruthy();
        expect(card().getByText("Rhea")).toBeTruthy();
        expect(card().queryByRole("button")).toBeNull();
    });
});
