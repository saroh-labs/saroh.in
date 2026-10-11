/**
 * Who makes Saroh, as facts (DEC-137): the one place the About and Contact
 * pages read the company's name, registered office, registration numbers,
 * phone and founder from.
 *
 * Every field but the name is optional, and a fact that isn't here is not
 * drawn: no row, no line, no card, and never a placeholder. Nothing is
 * guessed. To show one, add it here; no component changes.
 *
 * What is set today is what the site already publishes: the legal pages name
 * the LLP and its registered office (`content/privacy.ts`,
 * `content/refunds.ts`, owner's text, verbatim), and `company.test.ts` keeps
 * this copy the same as theirs. The email is `content/contact.ts` and the
 * accounts are `content/social.ts`.
 */
export interface CompanyFacts {
    /** The registered name of who makes Saroh. */
    legalName: string;
    /**
     * The registered office, a line at a time as an address is written.
     * Joined with ", " it is the address the legal pages give.
     */
    registeredOffice?: readonly string[];
    /** The LLP's identification number. */
    llpin?: string;
    /** The GST registration number. */
    gstin?: string;
    /** A number people can call, as it is shown, and when it is answered. */
    phone?: {
        /** As shown, e.g. with the country code and spaces. */
        display: string;
        /** For the `tel:` link: digits with a leading +. */
        dial: string;
        /** When it is answered, in words. */
        hours?: string;
    };
    /** The founder, for "A note from the founder" on About. */
    founder?: {
        name: string;
        /** The note, a paragraph at a time, in the founder's own words. */
        note: readonly string[];
        /** A square photo under `public/`, drawn as a circle. */
        photo?: { src: string; alt: string };
    };
}

export const COMPANY: CompanyFacts = {
    legalName: "Virashi Softwares LLP",
    registeredOffice: [
        "Unit 309, 3rd Floor, Tower-A, SAS Tower, Support Area, Medicity, Sector-38",
        "Gurgaon, Haryana 122001, India",
    ],
};

/** The registered office on one line, or null when it isn't set. */
export function officeLine(company: CompanyFacts = COMPANY): string | null {
    const lines = company.registeredOffice ?? [];
    return lines.length > 0 ? lines.join(", ") : null;
}

/** "LLPIN: … · GSTIN: …" with whichever is set, or null when neither is. */
export function registrationLine(
    company: CompanyFacts = COMPANY,
): string | null {
    const parts = [
        company.llpin ? `LLPIN: ${company.llpin}` : null,
        company.gstin ? `GSTIN: ${company.gstin}` : null,
    ].filter((part): part is string => part !== null);
    return parts.length > 0 ? parts.join(" · ") : null;
}

/** The founder, only once there is a name and a note to draw. */
export function founderNote(
    company: CompanyFacts = COMPANY,
): NonNullable<CompanyFacts["founder"]> | null {
    const founder = company.founder;
    if (!founder?.name.trim()) return null;
    return founder.note.some((p) => p.trim() !== "") ? founder : null;
}
