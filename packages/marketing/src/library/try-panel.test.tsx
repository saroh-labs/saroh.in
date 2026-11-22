import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LibraryBlocks } from "./library-blocks";
import type { LibraryControl } from "./types";

const palette: LibraryControl = {
    key: "palette",
    label: "Colours",
    options: [
        { value: "kesar", label: "Kesar" },
        { value: "tide", label: "Tide" },
    ],
};

const WORDS = {
    title: "Try it on your business",
    lead: "Type your name.",
    name: "Business name",
    town: "Town or area",
    namePlaceholder: "",
    townPlaceholder: "",
    colour: "Pick a colour",
    note: "Nothing is saved.",
    start: "Use this for my business",
};

function draw(startHref = vi.fn(() => "https://accounts.example/signup")) {
    render(
        <LibraryBlocks
            groups={[]}
            controls={[palette]}
            componentControls={[]}
            words={{
                toolbar: { label: "Try the blocks in", components: "Styles" },
                card: {
                    layouts: "Layouts",
                    coming: "Coming",
                    loading: "Loading",
                    failed: "Failed",
                },
            }}
            read={() => ""}
            previewSrc={() => "/library-preview/hero"}
            frameWidth={() => 1280}
            tryIt={{
                words: WORDS,
                trades: {
                    key: "trade",
                    label: "What you do",
                    options: [
                        { value: "salon", label: "Salon" },
                        { value: "food", label: "Bakery or food" },
                    ],
                },
                colourKey: "palette",
                startHref,
            }}
        />,
    );
    return startHref;
}

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.history.replaceState(null, "", "/");
});

describe("the library's Try panel (U12, KD12)", () => {
    it("never writes the name, town or trade into the page's address", () => {
        window.history.replaceState(null, "", "/website-library");
        const replace = vi.spyOn(window.history, "replaceState");
        const push = vi.spyOn(window.history, "pushState");
        const startHref = draw();
        fireEvent.change(screen.getByLabelText("Business name"), {
            target: { value: "Rasoi & Co" },
        });
        fireEvent.change(screen.getByLabelText("Town or area"), {
            target: { value: "Aundh" },
        });
        fireEvent.click(screen.getByRole("radio", { name: "Bakery or food" }));
        // The colour is the toolbar's choice: an id, kept in the address.
        fireEvent.click(screen.getAllByRole("radio", { name: "Tide" })[0]);

        const written = [...replace.mock.calls, ...push.mock.calls]
            .map((c) => String(c[2]))
            .join(" ");
        expect(written).toContain("palette=tide");
        for (const said of ["Rasoi", "Aundh", "food", "name="]) {
            expect(written).not.toContain(said);
            expect(window.location.href).not.toContain(said);
        }
        // The link's own href never holds the name; the click builds it.
        expect(startHref).toHaveBeenLastCalledWith({
            trade: "food",
            colour: "tide",
        });
        fireEvent.click(
            screen.getByRole("link", { name: "Use this for my business" }),
        );
        expect(startHref).toHaveBeenLastCalledWith({
            trade: "food",
            colour: "tide",
            name: "Rasoi & Co",
        });
    });
});
