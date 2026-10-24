import { BadRequestException } from "@nestjs/common";

/**
 * Saroh is for businesses in India for now (#1214, owner 24 Oct; #1212 is
 * the plan to sell elsewhere). Setup and Settings refuse any other country.
 * A business saved with another one before keeps it: only a country being
 * set or changed is checked, so sending its own back again, or saving
 * anything else, still works. "" (not said) reads as India everywhere.
 * The DTO can't hold this rule: it can't see the stored country.
 */
export function refuseCountryOutsideIndia(
    sent: string | undefined,
    current?: string | null,
): void {
    if (sent === undefined) return;
    const country = sent.trim().toUpperCase();
    // The demo seeds store "India" in full, which the tax rules read as IN.
    if (country === "" || country === "IN" || country === "INDIA") return;
    if (country === (current ?? "").trim().toUpperCase()) return;
    throw new BadRequestException({
        message: "Saroh is for businesses in India for now.",
        details: { field: "country" },
    });
}
