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

import type { PersonRow } from "@/lib/people";

import { ConfirmEmailChange, UserActions } from "./user-actions";
import { UserList } from "./user-list";
import { UsersToolbar } from "./users-toolbar";

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
    useRouter: () => router,
    usePathname: () => "/users/u1",
}));

const actions = vi.hoisted(() => ({
    sendSignInCodeAction: vi.fn(),
    markVerifiedAction: vi.fn(),
    changeSignInEmailAction: vi.fn(),
    confirmSignInEmailAction: vi.fn(),
    endSessionsAction: vi.fn(),
}));
vi.mock("@/lib/people-actions", () => actions);

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

beforeEach(() => {
    vi.clearAllMocks();
});
afterEach(cleanup);

function row(over: Partial<PersonRow> = {}): PersonRow {
    return {
        id: "u1",
        name: "Asha Rao",
        email: "asha@example.com",
        emailVerified: true,
        verifiedBy: "self",
        createdAt: "2026-10-01T10:00:00.000Z",
        businesses: 1,
        isOwner: true,
        lastSeenAt: null,
        isStaff: false,
        ...over,
    };
}

describe("UsersToolbar (U9)", () => {
    it("draws each chip as a toggle that says whether it is on", () => {
        render(<UsersToolbar query={{ q: "", chips: ["owners"] }} />);
        const group = screen.getByRole("group", { name: "Show only" });
        const owners = within(group).getByRole("button", { name: "Owners" });
        const loners = within(group).getByRole("button", {
            name: "No business yet",
        });
        expect(owners.getAttribute("aria-pressed")).toBe("true");
        expect(loners.getAttribute("aria-pressed")).toBe("false");
        expect(
            within(group).getByRole("button", { name: "Email not verified" }),
        ).toBeTruthy();
        expect(
            within(group).getByRole("button", { name: "Joined this week" }),
        ).toBeTruthy();
    });

    it("puts a chip in the address, keeping the search", () => {
        render(<UsersToolbar query={{ q: "asha", chips: [] }} />);
        fireEvent.click(screen.getByRole("button", { name: "Owners" }));
        expect(router.replace).toHaveBeenCalledWith(
            "/users?q=asha&filter=owners",
            { scroll: false },
        );
    });

    it("offers Clear search for a search alone, Clear filters with a chip, and nothing otherwise", () => {
        const { rerender } = render(
            <UsersToolbar query={{ q: "", chips: [] }} />,
        );
        expect(screen.queryByRole("button", { name: /^Clear/ })).toBeNull();

        rerender(<UsersToolbar query={{ q: "asha", chips: [] }} />);
        fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
        expect(router.replace).toHaveBeenLastCalledWith("/users", {
            scroll: false,
        });

        rerender(<UsersToolbar query={{ q: "", chips: ["unverified"] }} />);
        expect(
            screen.getByRole("button", { name: "Clear filters" }),
        ).toBeTruthy();
    });
});

describe("UserList (U9)", () => {
    it("opens every row, and shows the email once for a user with no name", () => {
        render(
            <UserList
                people={[
                    row(),
                    row({
                        id: "u2",
                        name: null,
                        email: "noname@example.com",
                        businesses: 0,
                        isOwner: false,
                        emailVerified: false,
                        verifiedBy: null,
                    }),
                ]}
            />,
        );
        const links = screen.getAllByRole("link");
        expect(links.map((link) => link.getAttribute("href"))).toEqual([
            "/users/u1",
            "/users/u2",
        ]);
        expect(within(links[0]).getByText("Asha Rao")).toBeTruthy();
        expect(within(links[0]).getByText("asha@example.com")).toBeTruthy();
        expect(within(links[0]).getByText("Owner")).toBeTruthy();
        expect(
            within(links[1]).getAllByText("noname@example.com"),
        ).toHaveLength(1);
        expect(within(links[1]).getByText("Email not verified")).toBeTruthy();
        expect(within(links[1]).getByText(/No business yet/)).toBeTruthy();
    });

    it("says when staff, not the user, verified the email", () => {
        render(<UserList people={[row({ verifiedBy: "staff" })]} />);
        expect(screen.getByText("Verified by staff")).toBeTruthy();
    });
});

function actionsFor(over: Partial<Parameters<typeof UserActions>[0]> = {}) {
    return render(
        <UserActions
            userId="u1"
            name="Asha Rao"
            email="asha@example.com"
            emailVerified={false}
            held={false}
            sessions={2}
            canEndSessions
            {...over}
        />,
    );
}

async function submitDialog(trigger: string, reason = "Asked on a call") {
    fireEvent.click(screen.getByRole("button", { name: trigger }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/Reason/), {
        target: { value: reason },
    });
    return dialog;
}

describe("UserActions (U9)", () => {
    it("has the header's actions", () => {
        actionsFor();
        for (const name of [
            "Send a sign-in code",
            "Mark verified…",
            "Change sign-in email…",
            "Sign out everywhere…",
            "Copy id",
        ]) {
            expect(screen.getByRole("button", { name })).toBeTruthy();
        }
    });

    it("leaves Sign out everywhere out without the people write", () => {
        actionsFor({ canEndSessions: false });
        expect(
            screen.queryByRole("button", { name: "Sign out everywhere…" }),
        ).toBeNull();
    });

    it("sends a sign-in code with a reason, and says where it went", async () => {
        actions.sendSignInCodeAction.mockResolvedValue({
            ok: true,
            data: { sent: true, to: "a***@example.com" },
        });
        actionsFor();
        const dialog = await submitDialog("Send a sign-in code");
        fireEvent.click(
            within(dialog).getByRole("button", { name: "Send code" }),
        );

        await waitFor(() =>
            expect(actions.sendSignInCodeAction).toHaveBeenCalledWith("u1", {
                reason: "Asked on a call",
                idempotencyKey: expect.any(String) as unknown,
            }),
        );
        await waitFor(() =>
            expect(toast.showSuccess).toHaveBeenCalledWith(
                "Sign-in code sent to a***@example.com",
                expect.stringMatching(/audit trail/),
            ),
        );
    });

    it("shows the API's refusal in the dialog, such as the hourly limit", async () => {
        actions.sendSignInCodeAction.mockResolvedValue({
            ok: false,
            error: "They've been sent 3 sign-in codes in the last hour. Try again in 12 minutes.",
            status: 429,
        });
        actionsFor();
        const dialog = await submitDialog("Send a sign-in code");
        fireEvent.click(
            within(dialog).getByRole("button", { name: "Send code" }),
        );
        expect(
            await within(dialog).findByText(/Try again in 12 minutes/),
        ).toBeTruthy();
        expect(toast.showSuccess).not.toHaveBeenCalled();
    });

    it("holds Send code and Mark verified while a changed email is held", () => {
        actionsFor({ held: true });
        expect(
            screen
                .getByRole("button", { name: "Send a sign-in code" })
                .hasAttribute("disabled"),
        ).toBe(true);
        expect(
            screen
                .getByRole("button", { name: "Mark verified…" })
                .hasAttribute("disabled"),
        ).toBe(true);
    });

    it("offers no Mark verified for an email already verified", () => {
        actionsFor({ emailVerified: true });
        expect(
            screen
                .getByRole("button", { name: "Mark verified…" })
                .hasAttribute("disabled"),
        ).toBe(true);
    });

    it("says the safeguards before an email change, and sends the new address", async () => {
        actions.changeSignInEmailAction.mockResolvedValue({
            ok: true,
            data: { changeId: "c1", codeHeldUntil: "2026-10-19T10:00:00Z" },
        });
        actionsFor();
        const dialog = await submitDialog("Change sign-in email…");
        expect(
            within(dialog).getByText(/is told, with the new address/),
        ).toBeTruthy();
        expect(within(dialog).getByText(/For 24 hours/)).toBeTruthy();
        expect(
            within(dialog).getByText(/only by a Platform owner/),
        ).toBeTruthy();
        fireEvent.change(within(dialog).getByLabelText("New sign-in email"), {
            target: { value: " new@example.com " },
        });
        fireEvent.click(
            within(dialog).getByRole("button", { name: "Change email" }),
        );
        await waitFor(() =>
            expect(actions.changeSignInEmailAction).toHaveBeenCalledWith(
                "u1",
                expect.objectContaining({ email: "new@example.com" }),
            ),
        );
    });
});

describe("ConfirmEmailChange (U9)", () => {
    it("names who made the change, and confirms it with a reason", async () => {
        actions.confirmSignInEmailAction.mockResolvedValue({
            ok: true,
            data: { confirmed: true },
        });
        render(
            <ConfirmEmailChange
                userId="u1"
                newEmail="new@example.com"
                requestedBy="Asha"
            />,
        );
        const dialog = await submitDialog("Confirm the change…", "Called them");
        expect(
            within(dialog).getByText(/Asha changed it to new@example.com/),
        ).toBeTruthy();
        fireEvent.click(
            within(dialog).getByRole("button", {
                name: "Confirm and send code",
            }),
        );
        await waitFor(() =>
            expect(actions.confirmSignInEmailAction).toHaveBeenCalledWith(
                "u1",
                {
                    reason: "Called them",
                    idempotencyKey: expect.any(String) as unknown,
                },
            ),
        );
    });
});
