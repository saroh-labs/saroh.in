import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { SentencePicker } from "./sentence-picker";

/**
 * Folio's sentence (VA08a–e, plan U10): each phrase a button that opens a
 * real listbox, moved by the arrows, picked by Enter, closed by Escape,
 * focus back on the phrase, and the price said in a live region.
 */

const SERVICES = [
    { id: "hatha", label: "Hatha yoga", price: "₹600" },
    { id: "private", label: "Private session", price: "₹2,500" },
    { id: "pranayama", label: "Pranayama", price: "₹350" },
];

function Harness() {
    const [chosen, setChosen] = useState("hatha");
    const s = SERVICES.find((x) => x.id === chosen);
    return (
        <SentencePicker
            announce={`${s?.label ?? ""} · ${s?.price ?? ""}`}
            phrases={[
                {
                    kind: "class",
                    before: "I'd like",
                    value: s?.label ?? null,
                    placeholder: "a class",
                    options: SERVICES.map((x) => ({
                        id: x.id,
                        label: x.label,
                    })),
                    selected: chosen,
                    onPick: setChosen,
                },
                {
                    kind: "time",
                    before: "on",
                    value: null,
                    placeholder: "a day and time",
                    options: [],
                    selected: null,
                    onPick: () => undefined,
                },
            ]}
        />
    );
}

describe("Folio's sentence", () => {
    it("names each phrase by what it changes", () => {
        render(<Harness />);
        expect(
            screen.getByRole("button", { name: "Change class, Hatha yoga" }),
        ).toHaveAttribute("aria-haspopup", "listbox");
        expect(
            screen.getByRole("button", { name: "Choose time" }),
        ).toBeVisible();
    });

    it("opens a listbox on the chosen option; the arrows move, Enter picks, focus returns and the price is said", () => {
        render(<Harness />);
        const phrase = screen.getByRole("button", {
            name: "Change class, Hatha yoga",
        });
        fireEvent.click(phrase);
        const list = screen.getByRole("listbox", { name: "class" });
        expect(phrase).toHaveAttribute("aria-expanded", "true");
        expect(document.activeElement).toBe(
            within(list).getByRole("option", { name: "Hatha yoga" }),
        );
        fireEvent.keyDown(list, { key: "ArrowDown" });
        expect(document.activeElement).toBe(
            within(list).getByRole("option", { name: "Private session" }),
        );
        fireEvent.keyDown(list, { key: "End" });
        fireEvent.keyDown(list, { key: "ArrowUp" });
        fireEvent.keyDown(list, { key: "Enter" });
        expect(screen.queryByRole("listbox")).toBeNull();
        const changed = screen.getByRole("button", {
            name: "Change class, Private session",
        });
        expect(document.activeElement).toBe(changed);
        expect(screen.getByText("Private session · ₹2,500")).toHaveAttribute(
            "aria-live",
            "polite",
        );
    });

    it("closes on Escape without letting it reach the frame", () => {
        render(<Harness />);
        fireEvent.click(screen.getByRole("button", { name: /Change class/ }));
        const list = screen.getByRole("listbox");
        let reached = false;
        document.addEventListener("keydown", () => (reached = true), {
            once: true,
        });
        fireEvent.keyDown(list, { key: "Escape" });
        expect(screen.queryByRole("listbox")).toBeNull();
        expect(reached).toBe(false);
        expect(document.activeElement).toBe(
            screen.getByRole("button", { name: /Change class/ }),
        );
    });

    it("says nothing on arrival, only after a pick", () => {
        render(<Harness />);
        expect(screen.queryByText("Hatha yoga · ₹600")).toBeNull();
    });

    it("keeps every phrase and option 44px under a finger", () => {
        render(<Harness />);
        const phrase = screen.getByRole("button", { name: /Change class/ });
        expect(phrase.className).toContain("min-h-11");
        fireEvent.click(phrase);
        for (const option of screen.getAllByRole("option")) {
            expect(option.className).toContain("min-h-11");
        }
    });
});
