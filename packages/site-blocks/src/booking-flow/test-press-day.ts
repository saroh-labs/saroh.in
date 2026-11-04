import { fireEvent, screen, within } from "@testing-library/react";

/**
 * Classic's booking page holds a day's times back until a day is pressed:
 * press the first free one, once the days are read.
 */
export async function pressDay(): Promise<void> {
    const strip = await screen.findByRole("radiogroup", { name: "Day" });
    const free = within(strip)
        .getAllByRole<HTMLButtonElement>("radio")
        .find((day) => !day.disabled);
    if (!free) throw new Error("No free day on the strip");
    fireEvent.click(free);
}
