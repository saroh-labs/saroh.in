import { describe, expect, it } from "vitest";

import type { CompanyFacts } from "./company";
import { COMPANY, founderNote, officeLine, registrationLine } from "./company";
import { PRIVACY } from "./privacy";
import { REFUNDS } from "./refunds";
import { MADE_BY } from "./resources";
import { TERMS } from "./terms";

/**
 * Who makes Saroh (DEC-137): the facts About and Contact draw are the ones
 * the legal pages already publish, and a fact that isn't set is nothing at
 * all, never a placeholder.
 */
describe("company facts", () => {
    it("names the LLP the footer and the legal pages name", () => {
        expect(MADE_BY).toContain(COMPANY.legalName);
        expect(PRIVACY.body).toContain(COMPANY.legalName);
        expect(TERMS.body).toContain(COMPANY.legalName);
        expect(REFUNDS.body).toContain(COMPANY.legalName);
    });

    it("gives the registered office exactly as Privacy and Refunds write it", () => {
        const office = officeLine();
        expect(office).not.toBeNull();
        const written = `${COMPANY.legalName}, ${office}.`;
        expect(PRIVACY.body).toContain(written);
        expect(REFUNDS.body).toContain(written);
    });

    it("holds no placeholder: nothing in brackets, no run of zeros", () => {
        // Every string the facts hold, however deep.
        const strings: string[] = [];
        JSON.stringify(COMPANY, (_key, value: unknown) => {
            if (typeof value === "string") strings.push(value);
            return value;
        });
        const all = strings.join("\n");
        expect(strings.length).toBeGreaterThan(1);
        expect(all).not.toMatch(/[[\]]/);
        expect(all).not.toMatch(/0{4,}/);
        expect(all.toLowerCase()).not.toContain("your name");
    });
});

describe("a fact that isn't set", () => {
    const bare: CompanyFacts = { legalName: "Example LLP" };

    it("is no office line and no registration line", () => {
        expect(officeLine(bare)).toBeNull();
        expect(officeLine({ ...bare, registeredOffice: [] })).toBeNull();
        expect(registrationLine(bare)).toBeNull();
    });

    it("writes whichever registration number is set", () => {
        expect(registrationLine({ ...bare, llpin: "AAB-1234" })).toBe(
            "LLPIN: AAB-1234",
        );
        expect(
            registrationLine({ ...bare, llpin: "AAB-1234", gstin: "06X" }),
        ).toBe("LLPIN: AAB-1234 · GSTIN: 06X");
        expect(registrationLine({ ...bare, gstin: "06X" })).toBe("GSTIN: 06X");
    });

    it("draws the founder's note only with a name and words", () => {
        expect(founderNote(bare)).toBeNull();
        expect(
            founderNote({ ...bare, founder: { name: " ", note: ["Hello."] } }),
        ).toBeNull();
        expect(
            founderNote({ ...bare, founder: { name: "Asha Rao", note: [] } }),
        ).toBeNull();
        expect(
            founderNote({
                ...bare,
                founder: { name: "Asha Rao", note: [" "] },
            }),
        ).toBeNull();
        expect(
            founderNote({
                ...bare,
                founder: { name: "Asha Rao", note: ["Hello."] },
            })?.name,
        ).toBe("Asha Rao");
    });

    it("is the state today for the founder, the phone and the numbers", () => {
        // Each waits for the owner's own facts; none is guessed.
        expect(founderNote()).toBeNull();
        expect(COMPANY.phone).toBeUndefined();
        expect(registrationLine()).toBeNull();
    });
});
