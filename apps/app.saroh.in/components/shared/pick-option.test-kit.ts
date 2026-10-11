import { act } from "react";

/**
 * Chooses an option of a list's dropdown filter (`ListFilter`) in a test,
 * by keyboard: jsdom has no pointer capture, which a press needs. The
 * dropdown is found by its accessible name ("Order status"), the option by
 * the words it starts with.
 */
export function pickOption(label: string, option: string | RegExp) {
    const box = document.querySelector<HTMLElement>(
        `[role="combobox"][aria-label="${label}"]`,
    );
    if (!box) throw new Error(`No dropdown named ${label}`);
    act(() => {
        press(box, "ArrowDown");
    });
    const hit = optionsOf().find((el) => {
        const words = el.textContent.trim();
        return typeof option === "string"
            ? words.startsWith(option)
            : option.test(words);
    });
    if (!hit) throw new Error(`No option ${String(option)} in ${label}`);
    act(() => {
        press(hit, "Enter");
    });
}

/** The open dropdown's options, as they read: "Open 3". */
export function openOptions(label: string): string[] {
    const box = document.querySelector<HTMLElement>(
        `[role="combobox"][aria-label="${label}"]`,
    );
    if (!box) throw new Error(`No dropdown named ${label}`);
    act(() => {
        press(box, "ArrowDown");
    });
    return optionsOf().map((el) => el.textContent.replace(/\s+/g, " ").trim());
}

const optionsOf = () =>
    Array.from(document.querySelectorAll<HTMLElement>('[role="option"]'));

function press(el: HTMLElement, key: string) {
    el.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    );
}
