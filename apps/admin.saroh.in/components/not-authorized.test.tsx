/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { StaffIdentity } from "@/lib/control-plane";

vi.mock("@/components/admin-shell", () => ({
    AdminShell: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="shell">{children}</div>
    ),
}));
vi.mock("@/components/sign-out-button", () => ({
    SignOutButton: () => <button type="button">Sign out</button>,
}));

const { NotAuthorized, NoAccessPanel } = await import("./not-authorized");
const { AdminShell } = await import("@/components/admin-shell");

afterEach(cleanup);

const support: StaffIdentity = {
    userId: "u1",
    email: "support@example.com",
    roles: ["SUPPORT"],
    permissions: ["organization:read"],
    viaBootstrap: false,
};

describe("NotAuthorized", () => {
    it("renders inside the console shell for staff who lack the permission", () => {
        const element = NotAuthorized({
            email: "support@example.com",
            staff: support,
        }) as ReactElement<{ staff: StaffIdentity }>;
        expect(element.type).toBe(AdminShell);
        expect(element.props.staff).toBe(support);

        render(element);
        expect(screen.getByTestId("shell")).toBeTruthy();
        expect(screen.getByText("Not authorized")).toBeTruthy();
        expect(
            screen.getByRole("link", { name: "Go to the overview" }),
        ).toBeTruthy();
        // Sign out lives in the shell's header, not in the panel.
        expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
    });

    it("keeps the bare page, with only Sign out, for someone who is not staff", () => {
        render(<NotAuthorized email="stranger@example.com" />);
        expect(screen.queryByTestId("shell")).toBeNull();
        expect(
            screen.getByText(
                "stranger@example.com does not have access to this area.",
            ),
        ).toBeTruthy();
        expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
        expect(screen.queryByRole("link")).toBeNull();
    });
});

describe("NoAccessPanel", () => {
    it("says nothing about why and points to the overview", () => {
        render(<NoAccessPanel email="support@example.com" />);
        expect(
            screen.getByText(/does not have access to this area/),
        ).toBeTruthy();
        expect(
            screen
                .getByRole("link", { name: "Go to the overview" })
                .getAttribute("href"),
        ).toBe("/");
    });
});
