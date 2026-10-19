/** @vitest-environment jsdom */
import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BreakGlassBanner } from "./break-glass-banner";

/**
 * The break-glass banner (admin console redesign U10, R16): one line and
 * Make me Platform owner, which asks a reason, records the grant through
 * the API and refreshes, so the line goes. The API's own refusal (a grant
 * already on record) and its ledger row are `admin-staff-claim.db.spec.ts`.
 */

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh }),
}));
const claim = vi.fn();
vi.mock("@/lib/team-actions", () => ({
    claimPlatformOwnerAction: (input: unknown) => claim(input) as unknown,
}));
const showSuccess = vi.fn();
vi.mock("@saroh/ui/toast", () => ({
    showSuccess: (message: string) => showSuccess(message) as unknown,
}));

afterEach(() => {
    cleanup();
    claim.mockReset();
    refresh.mockReset();
    showSuccess.mockReset();
});

function open() {
    render(<BreakGlassBanner />);
    expect(
        screen.getByText(
            /in through the emergency staff list, so this access can.t be taken back or traced to a role/,
        ),
    ).toBeTruthy();
    fireEvent.click(
        screen.getByRole("button", { name: "Make me Platform owner" }),
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByRole("textbox"), {
        target: { value: "Recording my own access" },
    });
    fireEvent.click(
        within(dialog).getByRole("button", { name: "Make me Platform owner" }),
    );
}

describe("the break-glass banner", () => {
    it("records the grant with a reason and refreshes", async () => {
        claim.mockResolvedValue({ ok: true, data: { added: [] } });
        open();

        await waitFor(() => expect(refresh).toHaveBeenCalled());
        expect(claim).toHaveBeenCalledWith({
            reason: "Recording my own access",
            idempotencyKey: expect.any(String) as unknown,
        });
        expect(showSuccess).toHaveBeenCalledWith(
            "You're a Platform owner on the record.",
        );
    });

    it("says the API's refusal and leaves the line", async () => {
        claim.mockResolvedValue({
            ok: false,
            error: "You already have a recorded grant. Change your roles in Team.",
        });
        open();

        await waitFor(() =>
            expect(
                screen.getByText(
                    "You already have a recorded grant. Change your roles in Team.",
                ),
            ).toBeTruthy(),
        );
        expect(refresh).not.toHaveBeenCalled();
    });
});
