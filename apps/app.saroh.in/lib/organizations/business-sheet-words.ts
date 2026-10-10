import type { BusinessSheet } from "./business-rows";
import { kindOf, kindWords } from "./kind";

/**
 * What each of Settings › Business's sheets is called, the line under its
 * title, and what its save says, in the words of what is being set up
 * (DEC-070). Pure.
 */

/** "Business name" for a business; the kind's own label otherwise. */
export function nameLabelOf(kind: unknown): string {
    return kindOf(kind) === "BUSINESS"
        ? "Business name"
        : kindWords(kind).nameLabel;
}

export interface SheetWords {
    title: string;
    description: string;
}

interface Page {
    kind: unknown;
    /** GST-registered, as saved. */
    registered: boolean;
}

export function sheetWords(sheet: BusinessSheet, page: Page): SheetWords {
    const words = kindWords(page.kind);
    switch (sheet) {
        case "kind":
            return {
                title: "What this is",
                description: "What you're setting up with Saroh.",
            };
        case "name":
            return {
                title: nameLabelOf(page.kind),
                description: `The name ${words.people} know you by.`,
            };
        case "logo":
            return {
                title: "Logo",
                description: "Goes on your invoices and receipts.",
            };
        case "legalName":
            return {
                title: "Legal name",
                description: "The name your invoices are issued in.",
            };
        case "type":
            return {
                title: "Type",
                description: "How the business is registered.",
            };
        case "timezone":
            return {
                title: "Time zone",
                description: "The time your work runs on.",
            };
        case "contactEmail":
            return {
                title: "Contact email",
                description: `Where ${words.people} can write to you.`,
            };
        case "phone":
            return {
                title: "Phone on your website",
                description: "The number your site shows with a Call button.",
            };
        case "website":
            return {
                title: "Website",
                description: "A site you have outside Saroh, if any.",
            };
        case "gst":
            return {
                title: "GST registration",
                description: "Whether your invoices are tax invoices.",
            };
        case "taxId":
            return page.registered
                ? {
                      title: "GSTIN",
                      description: "Printed on every tax invoice.",
                  }
                : {
                      title: "Tax ID",
                      description: "Any VAT or tax registration number.",
                  };
        case "numbers":
            return {
                title: "Invoice numbers",
                description: "How your invoices are numbered.",
            };
        case "delivery":
            return {
                title: "GST on delivery",
                description: "The rate and SAC code delivery is charged under.",
            };
        case "pay":
            return {
                title: "How to pay us",
                description:
                    "UPI and bank details for customers who pay you directly.",
            };
        case "hours":
            return {
                title: "Opening hours",
                description: "When you're open. Applies to every location.",
            };
        case "address":
            return {
                title: "Registered address",
                description:
                    "Printed under your legal name on invoices and receipts.",
            };
    }
}

/** The sheets whose fields print on an invoice. */
const PRINTED: readonly BusinessSheet[] = [
    "name",
    "legalName",
    "gst",
    "taxId",
    "numbers",
    "delivery",
    "address",
];

/** The sheets that show "How it prints" under their fields, live. */
export const PREVIEWED: readonly BusinessSheet[] = [
    ...PRINTED,
    "contactEmail",
    "website",
];

/** What a save says: "Legal name saved. Invoices from now on use it." */
export function savedWords(sheet: BusinessSheet, page: Page): string {
    const { title } = sheetWords(sheet, page);
    return PRINTED.includes(sheet)
        ? `${title} saved. Invoices from now on use it.`
        : `${title} saved`;
}
