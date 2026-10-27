import { act, fireEvent, screen } from "@testing-library/react";

/** Typing into a field by its label; `n` picks one of several (lines, two States). */
export function type(label: string | RegExp, value: string, n = 0) {
    const el = screen.getAllByLabelText(label)[n];
    if (!el) throw new Error(`No field labelled ${String(label)} (${n})`);
    fireEvent.change(el, { target: { value } });
}

/** A line: item, then the rest by label. */
export function line(n: number, values: Record<string, string>) {
    for (const [label, value] of Object.entries(values)) type(label, value, n);
}

export const addLine = () =>
    fireEvent.click(screen.getByRole("button", { name: "+ Add a line" }));

export const paper = (name: string) =>
    screen.getByRole("complementary", { name }).querySelector(".td-paper")
        ?.textContent ?? "";

/** Through the email gate (no provider: it opens), then Print. */
export async function unlockAndPrint(email: string) {
    type(/as a PDF$/, email);
    await act(() =>
        Promise.resolve(
            fireEvent.click(
                screen.getByRole("button", { name: "Email me the PDF" }),
            ),
        ),
    );
    fireEvent.click(
        screen.getByRole("button", { name: "Print or save as PDF" }),
    );
}
