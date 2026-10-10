import { beforeEach, describe, expect, it, vi } from "vitest";

const error = vi.fn();
vi.mock("sonner", () => ({
    toast: { error: (...a: unknown[]) => error(...a) },
}));

import { setErrorAction, showError } from "./toast";

const SENTENCE =
    "You've been signed out. Sign in again and what you typed stays here.";

describe("an error sentence with a way out (setErrorAction)", () => {
    beforeEach(() => error.mockClear());

    it("an ordinary error stays until dismissed, with no button", () => {
        showError("Couldn't save the service");
        expect(error).toHaveBeenCalledWith("Couldn't save the service", {
            description: undefined,
            duration: Number.POSITIVE_INFINITY,
            closeButton: true,
        });
    });

    it("the registered sentence gets its button, from any call site, as one toast", () => {
        const signIn = vi.fn();
        const off = setErrorAction(SENTENCE, {
            label: "Sign in",
            onClick: signIn,
        });

        showError(SENTENCE);
        showError(SENTENCE);

        const first = error.mock.calls[0]?.[1];
        const second = error.mock.calls[1]?.[1];
        expect(first.action.label).toBe("Sign in");
        expect(first.duration).toBe(Number.POSITIVE_INFINITY);
        // The same id both times: the second replaces the first.
        expect(first.id).toBe(second.id);

        // Pressing it runs the way out and leaves the toast up.
        const event = { preventDefault: vi.fn() };
        first.action.onClick(event);
        expect(signIn).toHaveBeenCalledTimes(1);
        expect(event.preventDefault).toHaveBeenCalled();

        off();
    });

    it("finds the sentence as a second line too", () => {
        const off = setErrorAction(SENTENCE, {
            label: "Sign in",
            onClick: vi.fn(),
        });
        showError("Couldn't save", SENTENCE);
        expect(error.mock.calls[0]?.[1].action.label).toBe("Sign in");
        off();
    });

    it("taken back, the sentence is an ordinary error again", () => {
        const off = setErrorAction(SENTENCE, {
            label: "Sign in",
            onClick: vi.fn(),
        });
        off();
        showError(SENTENCE);
        expect(error.mock.calls[0]?.[1].action).toBeUndefined();
    });
});
