import { BadRequestException } from "@nestjs/common";
import type { Edition } from "@saroh/edition";
import { editionForCountry } from "@saroh/edition";

const refuse = (message: string) =>
    new BadRequestException({ message, details: { field: "country" } });

/**
 * The countries an edition serves, and it decides nothing else: a business's
 * country sets its edition once, at setup (DEC-204). India's address stays as
 * it was (DEC-190): it refuses any other country, "" reads as India, and a
 * business saved with another before keeps it.
 *
 * Global needs a country at setup, never India, and it can't change after:
 * currency and tax follow it, so moving is a rare job done by Saroh. Only a
 * country being set or changed is checked, so sending its own back, or saving
 * anything else, still works. The DTO can't hold this: it can't see the stored
 * country.
 */
export function refuseCountryOutsideEdition(
    edition: Edition,
    sent: string | undefined,
    current?: string | null,
): void {
    const country = sent?.trim().toUpperCase();
    const stored = (current ?? "").trim().toUpperCase();
    if (edition === "INDIA") {
        if (country === undefined) return;
        // The demo seeds store "India" in full, which the tax rules read as IN.
        if (country === "" || country === "IN" || country === "INDIA") return;
        if (country === stored) return;
        throw refuse("Saroh is for businesses in India for now.");
    }
    if (current === undefined) {
        if (!country || !/^[A-Z]{2}$/.test(country)) {
            throw refuse("Choose your business's country.");
        }
        if (editionForCountry(country) !== "GLOBAL") {
            throw refuse("Businesses in India use Saroh for India.");
        }
        return;
    }
    if (country === undefined || country === stored) return;
    throw refuse("Contact us to change your business's country.");
}
