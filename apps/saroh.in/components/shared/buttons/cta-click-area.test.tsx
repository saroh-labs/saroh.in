// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const track = vi.fn();
const keep = vi.fn();
vi.mock("@/lib/analytics", () => ({
    track: (...a: unknown[]) => {
        track(...a);
    },
}));
vi.mock("@/lib/referral", () => ({
    keepButtonSource: (...a: unknown[]) => {
        keep(...a);
    },
}));

import { CtaClickArea } from "./cta-click-area";

afterEach(() => {
    cleanup();
    track.mockClear();
    keep.mockClear();
});

describe("CtaClickArea", () => {
    it("a package page's start button keeps its source and sends cta_click", () => {
        render(
            <CtaClickArea src="for-salons" mode="open">
                <a
                    data-cta=""
                    href="#start"
                    onClick={(e) => e.preventDefault()}
                >
                    Start free
                </a>
                <a href="#other" onClick={(e) => e.preventDefault()}>
                    Other link
                </a>
            </CtaClickArea>,
        );
        fireEvent.click(screen.getByText("Other link"));
        expect(track).not.toHaveBeenCalled();
        fireEvent.click(screen.getByText("Start free"));
        expect(keep).toHaveBeenCalledWith("for-salons", expect.any(String));
        expect(track).toHaveBeenCalledWith("cta_click", {
            page: "for-salons",
            mode: "open",
        });
    });
});
