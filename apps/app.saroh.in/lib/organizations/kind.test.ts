import { describe, expect, it } from "vitest";

import {
    firstRunOrder,
    kindDefaults,
    kindOf,
    kindWords,
    ORGANIZATION_KINDS,
    preselect,
} from "./kind";

describe("kindOf", () => {
    it("keeps the three kinds the API stores", () => {
        for (const kind of ORGANIZATION_KINDS) expect(kindOf(kind)).toBe(kind);
    });

    it("reads anything else as a business, as an older API means", () => {
        for (const raw of [undefined, null, "", "SHOP", "solo", 3]) {
            expect(kindOf(raw)).toBe("BUSINESS");
        }
    });
});

describe("kindWords (KTD-5)", () => {
    it("speaks to a business as today", () => {
        expect(kindWords("BUSINESS")).toEqual({
            owner: "your business",
            Owner: "Your business",
            people: "customers",
            People: "Customers",
            person: "customer",
            nameLabel: "What is it called?",
            settingsTab: "Business",
            registeredAddress: "registered address",
        });
    });

    it("speaks to Just me as a person with clients", () => {
        const words = kindWords("SOLO");
        expect(words.owner).toBe("you");
        expect(words.people).toBe("clients");
        expect(words.person).toBe("client");
        expect(words.nameLabel).toBe("Your name or brand");
        expect(words.settingsTab).toBe("Your details");
        expect(words.registeredAddress).toBe("your address");
    });

    it("speaks to A site for my work as a person with readers", () => {
        const words = kindWords("WORK");
        expect(words.owner).toBe("you");
        expect(words.People).toBe("Readers");
        expect(words.nameLabel).toBe("Your name or brand");
        expect(words.settingsTab).toBe("Your details");
    });

    it("gives an unknown kind the business's words", () => {
        expect(kindWords("SHOP")).toEqual(kindWords("BUSINESS"));
        expect(kindWords(undefined)).toEqual(kindWords("BUSINESS"));
    });
});

describe("kind defaults (KTD-6)", () => {
    it("leads with Sell and pre-selects it only for a business", () => {
        expect(firstRunOrder("BUSINESS")[0]).toBe("COMMERCE");
        expect(preselect("BUSINESS")).toBe("COMMERCE");
        expect(preselect("SOLO")).toBeNull();
        expect(preselect("WORK")).toBe("WEBSITE");
    });

    it("never leaves Sell out, only moves it last", () => {
        for (const kind of ["SOLO", "WORK"] as const) {
            expect(firstRunOrder(kind).at(-1)).toBe("COMMERCE");
        }
    });

    it("puts bookings then an invoice first for Just me, the website first for work", () => {
        expect(firstRunOrder("SOLO").slice(0, 2)).toEqual([
            "APPOINTMENTS",
            "INVOICE",
        ]);
        expect(firstRunOrder("WORK")[0]).toBe("WEBSITE");
    });

    it("asks whether it is registered except for a site for my work", () => {
        expect(kindDefaults("BUSINESS").asksRegistered).toBe(true);
        expect(kindDefaults("SOLO").asksRegistered).toBe(true);
        expect(kindDefaults("WORK").asksRegistered).toBe(false);
    });

    it("picks each kind's starter template", () => {
        expect(kindDefaults("BUSINESS").starterTemplate).toBe("starter");
        expect(kindDefaults("SOLO").starterTemplate).toBe("personal");
        expect(kindDefaults("WORK").starterTemplate).toBe("portfolio");
    });
});
