import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import {
    clockWords,
    dayWords,
    moneyWords,
    moneyWordsMinor,
    timeWords,
    whenWords,
} from "./words-format";

const KOLKATA = "Asia/Kolkata";

describe("money in a sentence", () => {
    it("leaves the paise off a whole amount and keeps them otherwise", () => {
        expect(moneyWords("1250.00", "INR")).toBe("₹1,250");
        expect(moneyWords("1250.50", "INR")).toBe("₹1,250.50");
        expect(moneyWords("1250.5", "INR")).toBe("₹1,250.50");
        expect(moneyWords("0", "INR")).toBe("₹0");
    });

    it("groups in lakh and crore", () => {
        expect(moneyWords("2044971", "INR")).toBe("₹20,44,971");
    });

    it("never floats: a large amount keeps every digit", () => {
        expect(moneyWords("90071992547409931.07", "INR")).toBe(
            "₹90,07,19,92,54,74,09,931.07",
        );
    });

    it("reads a Decimal-like value and a negative one", () => {
        expect(moneyWords({ toString: () => "60" }, "INR")).toBe("₹60");
        expect(moneyWords("-49.5", "INR")).toBe("-₹49.50");
    });

    it("reads minor units", () => {
        expect(moneyWordsMinor(125000, "INR")).toBe("₹1,250");
        expect(moneyWordsMinor(125050, "INR")).toBe("₹1,250.50");
        expect(moneyWordsMinor(4950, "INR")).toBe("₹49.50");
        expect(moneyWordsMinor(-500, "INR")).toBe("-₹5");
    });

    it("uses another currency's own sign, and its code when it has none", () => {
        expect(moneyWords("12.00", "USD")).toBe("$12");
        expect(moneyWords("12.00", "not-a-code")).toBe("not-a-code 12");
    });
});

describe("a day in a sentence", () => {
    const at = new Date("2025-10-12T04:00:00.000Z");

    it("is the day and three letters of the month", () => {
        expect(dayWords(at, KOLKATA)).toBe("12 Oct");
        expect(dayWords(new Date("2026-09-05T06:00:00.000Z"), KOLKATA)).toBe(
            "5 Sep",
        );
    });

    it("says the year or the weekday when asked", () => {
        expect(dayWords(at, KOLKATA, { year: true })).toBe("12 Oct 2025");
        expect(dayWords(at, KOLKATA, { weekday: true })).toBe("Sun 12 Oct");
        expect(dayWords(at, KOLKATA, { weekday: true, year: true })).toBe(
            "Sun 12 Oct 2025",
        );
    });

    it("is the day in the zone it is given, not the server's", () => {
        const late = new Date("2025-10-12T20:00:00.000Z");
        expect(dayWords(late, KOLKATA)).toBe("13 Oct");
        expect(dayWords(late, "UTC")).toBe("12 Oct");
        expect(dayWords(late, "America/New_York")).toBe("12 Oct");
    });

    it("throws on a zone that doesn't exist, as Intl does", () => {
        expect(() => dayWords(at, "Not/AZone")).toThrow(RangeError);
    });
});

describe("a time in a sentence", () => {
    it("is on the 12-hour clock, with am and pm in small letters", () => {
        expect(timeWords(new Date("2025-10-12T04:00:00.000Z"), KOLKATA)).toBe(
            "9:30 am",
        );
        expect(timeWords(new Date("2025-10-12T12:35:00.000Z"), KOLKATA)).toBe(
            "6:05 pm",
        );
    });

    it("says noon and midnight as 12", () => {
        expect(timeWords(new Date("2025-10-12T06:30:00.000Z"), KOLKATA)).toBe(
            "12:00 pm",
        );
        expect(timeWords(new Date("2025-10-12T18:30:00.000Z"), KOLKATA)).toBe(
            "12:00 am",
        );
    });

    it("reads a wall-clock value the same way", () => {
        expect(clockWords("09:30")).toBe("9:30 am");
        expect(clockWords("18:00")).toBe("6:00 pm");
        expect(clockWords("00:15")).toBe("12:15 am");
        expect(clockWords("12:00")).toBe("12:00 pm");
        expect(clockWords("closed")).toBe("closed");
    });

    it("joins a day and its time with a comma", () => {
        const at = new Date("2025-10-12T04:00:00.000Z");
        expect(whenWords(at, KOLKATA)).toBe("12 Oct, 9:30 am");
        expect(whenWords(at, KOLKATA, { weekday: true })).toBe(
            "Sun 12 Oct, 9:30 am",
        );
    });
});

/**
 * One formatter each. A notification, an email or a customer's notice that
 * formats its own amount, day or time drifts from the rest ("14:00" in one
 * email, "2:00 pm" in the next), so the files those sentences are written in
 * may not reach for `Intl` or a `toLocale…` call themselves.
 */
describe("the sentences the API sends use these formatters", () => {
    const SRC = join(__dirname, "..");
    const WORDED = [
        "common/email.ts",
        "common/email-welcome.ts",
        "modules/notifications",
        "modules/site-accounts/notify-templates.ts",
        "modules/site-accounts/thread-poster.ts",
        "modules/communications/transactional.ts",
        "modules/billing/billing-emails.ts",
        "modules/billing/billing-email.job.ts",
        "modules/invoices/invoice-send.service.ts",
    ];
    const NATIVE =
        /\bIntl\.(NumberFormat|DateTimeFormat)\b|\.toLocale(Date|Time)?String\(|\.toFormat\(/;

    function files(path: string): string[] {
        const abs = join(SRC, path);
        if (statSync(abs).isFile()) return [abs];
        return readdirSync(abs).flatMap((name) => files(join(path, name)));
    }

    it("none of them formats an amount, a day or a time by hand", () => {
        const found = WORDED.flatMap((path) => files(path))
            .filter((abs) => abs.endsWith(".ts") && !/\.spec\.ts$/.test(abs))
            .flatMap((abs) =>
                readFileSync(abs, "utf8")
                    .split("\n")
                    .map((line, i) => ({ line, at: i + 1 }))
                    .filter(({ line }) => {
                        const code = line.trim();
                        if (code.startsWith("//") || code.startsWith("*")) {
                            return false;
                        }
                        return NATIVE.test(code);
                    })
                    .map(
                        ({ at }) =>
                            `${relative(SRC, abs).split(sep).join("/")}:${at}`,
                    ),
            );
        expect(found).toEqual([]);
    });
});
