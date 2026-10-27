import { describe, expect, it } from "vitest";

import { decodeQr } from "../../test-qr";
import { phoneProblem, readPhone, vcard } from "./logic";

// The boards' sample: Meera Iyer of Rye Studio.
const MEERA = {
    name: "Meera Iyer",
    role: "Owner",
    business: "Rye Studio",
    phone: "+91 98765 43210",
    email: "meera@example.com",
    website: "example.com/ryestudio",
    address: "",
};

describe("vcard", () => {
    it("writes the board's sample as a vCard 3.0", () => {
        expect(vcard(MEERA)).toBe(
            [
                "BEGIN:VCARD",
                "VERSION:3.0",
                "N:Iyer;Meera;;;",
                "FN:Meera Iyer",
                "ORG:Rye Studio",
                "TITLE:Owner",
                "TEL;TYPE=CELL:+919876543210",
                "EMAIL;TYPE=INTERNET:meera@example.com",
                "URL:https://example.com/ryestudio",
                "END:VCARD",
            ].join("\r\n"),
        );
    });

    it("escapes commas, semicolons, backslashes and new lines", () => {
        const v = vcard({
            ...MEERA,
            business: "Rye Studio; Hair, Skin\\Nails",
            address: "14 Hill Road,\nBandra West; Mumbai",
        });
        expect(v).toContain("ORG:Rye Studio\\; Hair\\, Skin\\\\Nails");
        expect(v).toContain(
            "ADR;TYPE=WORK:;;14 Hill Road\\,\\nBandra West\\; Mumbai;;;;",
        );
    });

    it("leaves empty fields out, and a one-word name in the given name", () => {
        expect(
            vcard({
                ...MEERA,
                name: "Meera",
                role: "",
                business: "",
                email: "",
                website: "",
            }),
        ).toBe(
            "BEGIN:VCARD\r\nVERSION:3.0\r\nN:;Meera;;;\r\nFN:Meera\r\nTEL;TYPE=CELL:+919876543210\r\nEND:VCARD",
        );
    });

    it("draws a code a camera reads back as the same card", () => {
        const v = vcard(MEERA);
        expect(decodeQr(v)).toBe(v);
    });
});

describe("the phone", () => {
    it("reads Indian mobiles however they're typed", () => {
        expect(readPhone("+91 98765 43210")).toBe("+919876543210");
        expect(readPhone("098765 43210")).toBe("+919876543210");
        expect(readPhone("9876543210")).toBe("+919876543210");
        expect(readPhone("+44 20 7946 0000")).toBe("+442079460000");
    });

    it("says how many digits a short number has", () => {
        expect(phoneProblem("+91 98765 4321")).toBe(
            "Indian mobile numbers have 10 digits after +91. This one has 9.",
        );
        expect(phoneProblem("+91 98765 43210")).toBeNull();
    });
});
