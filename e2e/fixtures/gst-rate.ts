import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * The GST rate as buttons (DEC-176, `GstRatePicker`): the main row is a
 * radio group named for the field (0%, 5%, 18%, 40%, and "Not set" where a
 * field may be left empty), and "Other rate" is a disclosure beside it that
 * opens a second row of rates (0.25%, 1.5%, 3%, 12%, 28%).
 */

/** The whole picker whose main row is named `name`, both rows inside it. */
export function ratePicker(scope: Page | Locator, name: string | RegExp) {
    // `has` is looked for inside each picker, so it starts from the page.
    const page = "page" in scope ? scope.page() : scope;
    return scope.locator('[data-slot="gst-rate-picker"]').filter({
        has: page.getByRole("radiogroup", { name, exact: true }),
    });
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A rate's chip, "5" or "1.5" (0% is named "0%, nil-rated or exempt"). */
export function rateChip(picker: Locator, rate: string): Locator {
    return picker.getByRole("radio", {
        name: new RegExp(`^${escape(rate)}%`),
    });
}

/** The Other rate disclosure. */
export function otherRate(picker: Locator): Locator {
    return picker.getByRole("button", { name: "Other rate" });
}

/**
 * Press `rate`, opening Other rate first when the rate is behind it, and
 * wait for its chip to read as chosen.
 */
export async function chooseRate(picker: Locator, rate: string) {
    const chip = rateChip(picker, rate);
    if ((await chip.count()) === 0) {
        const other = otherRate(picker);
        await expect(other).toBeVisible();
        if ((await other.getAttribute("aria-expanded")) !== "true") {
            await other.click();
        }
        await expect(other).toHaveAttribute("aria-expanded", "true");
    }
    await chip.click();
    await expect(chip).toHaveAttribute("aria-checked", "true");
}
