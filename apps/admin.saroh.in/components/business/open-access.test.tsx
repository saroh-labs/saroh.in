/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const openAccessAction = vi.fn();
vi.mock("@/lib/business-actions", () => ({
    openAccessAction: (...args: unknown[]) =>
        openAccessAction(...args) as unknown,
}));

import { OpenAccess } from "./open-access";

describe("OpenAccess", () => {
    beforeEach(() => {
        openAccessAction.mockReset().mockResolvedValue({ ok: true });
    });

    it("says the reason goes in the audit trail", () => {
        render(<OpenAccess organizationId="org_1" />);
        expect(
            screen.getByLabelText(/kept with your name in the audit trail/),
        ).toBeTruthy();
    });

    it("fills the reason in one tap and opens the session with it", async () => {
        render(<OpenAccess organizationId="org_1" />);
        const open = screen.getByRole("button", {
            name: "Open support access",
        });
        expect((open as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(
            screen.getByRole("button", { name: "Checking a setting" }),
        );
        expect(
            screen.getByLabelText<HTMLTextAreaElement>(/audit trail/).value,
        ).toBe("Checking a setting");
        fireEvent.click(open);
        await waitFor(() =>
            expect(openAccessAction).toHaveBeenCalledWith(
                "org_1",
                expect.objectContaining({ reason: "Checking a setting" }),
            ),
        );
    });

    it("keeps what the operator writes as the reason", async () => {
        render(<OpenAccess organizationId="org_1" />);
        fireEvent.change(screen.getByLabelText(/audit trail/), {
            target: { value: "Owner emailed about slots" },
        });
        fireEvent.click(
            screen.getByRole("button", { name: "Open support access" }),
        );
        await waitFor(() =>
            expect(openAccessAction).toHaveBeenCalledWith(
                "org_1",
                expect.objectContaining({
                    reason: "Owner emailed about slots",
                }),
            ),
        );
    });
});
