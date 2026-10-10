/**
 * `reportFailure`, the one way a screen says a failed write: a refusal by
 * role is a notice in the toast module's neutral style, never the red error
 * a breakage gets.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { toFailure } from "@/lib/api/failure";

import { reportFailure } from "./plan-refusal";

const showError = vi.fn();
const showInfo = vi.fn();
vi.mock("@saroh/ui/toast", () => ({
    showError: (...args: unknown[]) => showError(...args) as unknown,
    showInfo: (...args: unknown[]) => showInfo(...args) as unknown,
}));
vi.mock("@/lib/billing/access", () => ({ upgradeHref: () => "/settings" }));

beforeEach(() => {
    showError.mockReset();
    showInfo.mockReset();
});

describe("reportFailure", () => {
    it("shows a refusal by role as a notice, not an error", () => {
        reportFailure(
            toFailure(
                {
                    error: {
                        message: "Your role can't do this.",
                        details: {
                            code: "ROLE_DENIED",
                            action: "booking:write",
                        },
                    },
                },
                "Could not move the booking.",
            ),
        );
        expect(showInfo).toHaveBeenCalledWith(
            "Your role can't change bookings. An owner or admin can change this in Settings › Team.",
        );
        expect(showError).not.toHaveBeenCalled();
    });

    it("shows a breakage as the error it is", () => {
        reportFailure(toFailure(null, "Could not move the booking."));
        expect(showError).toHaveBeenCalledWith("Could not move the booking.");
        expect(showInfo).not.toHaveBeenCalled();
    });

    it("shows an endpoint's own refusal as an error, as before", () => {
        reportFailure({ error: "That name is taken." });
        expect(showError).toHaveBeenCalledWith("That name is taken.");
    });

    it("uses the fallback for an empty message", () => {
        reportFailure({ error: " " }, "Could not save.");
        expect(showError).toHaveBeenCalledWith("Could not save.");
    });
});
