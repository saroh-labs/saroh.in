import { beforeEach, describe, expect, it, vi } from "vitest";

interface Options {
    description?: string;
    duration?: number;
    closeButton?: boolean;
}
const error = vi.fn<(message: string, options?: Options) => void>();
const message = vi.fn<(message: string, options?: Options) => void>();
vi.mock("sonner", () => ({
    toast: {
        error: (text: string, options?: Options) => error(text, options),
        message: (text: string, options?: Options) => message(text, options),
    },
}));

import { setRefusalTest, showError, showRefusal, UNDO_MS } from "./toast";

const REFUSED =
    "Your role can't change bookings. An owner or admin can change this in Settings › Team.";

describe("a refusal is not an error (setRefusalTest)", () => {
    beforeEach(() => {
        error.mockClear();
        message.mockClear();
    });

    it("showRefusal is the neutral toast, ten seconds, closable", () => {
        showRefusal(REFUSED);
        expect(error).not.toHaveBeenCalled();
        expect(message).toHaveBeenCalledWith(REFUSED, {
            description: undefined,
            duration: UNDO_MS,
            closeButton: true,
        });
    });

    it("with no test registered, showError is the error it always was", () => {
        showError(REFUSED);
        expect(error).toHaveBeenCalledTimes(1);
        expect(message).not.toHaveBeenCalled();
    });

    it("a registered refusal said through showError is never red", () => {
        const off = setRefusalTest((text) => text.startsWith("Your role "));

        showError(REFUSED);
        expect(error).not.toHaveBeenCalled();
        expect(message).toHaveBeenCalledWith(
            REFUSED,
            expect.objectContaining({ duration: UNDO_MS }),
        );

        // Anything else is still an error that stays.
        showError("Couldn't save the service.");
        expect(error).toHaveBeenCalledWith(
            "Couldn't save the service.",
            expect.objectContaining({ duration: Number.POSITIVE_INFINITY }),
        );

        off();
    });

    it("taking the test back restores the error", () => {
        const off = setRefusalTest(() => true);
        off();
        showError(REFUSED);
        expect(error).toHaveBeenCalledTimes(1);
        expect(message).not.toHaveBeenCalled();
    });
});
