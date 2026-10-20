import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { SellsRead } from "@/lib/insights/reads";
import {
    sellsEmpty,
    sellsRead,
    sellsWithoutMoney,
    sellsWithoutNames,
} from "@/lib/insights/sells.fixture";

import { BestCustomers } from "./best-customers";

/**
 * "Who are my best customers?" (DEC-171, plan U13, #1095) for each role:
 * an owner sees names, money and links; without payments, counts and no
 * money; without customers' names, numbered rows with no link; nobody yet,
 * one sentence.
 */

const draw = (read: SellsRead) =>
    renderToStaticMarkup(<BestCustomers read={read} />);

const text = (html: string) =>
    html
        .replace(/<[^>]+>/g, " ")
        .replace(/&#x27;|&#39;/g, "'")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ")
        .trim();

const hrefs = (html: string) =>
    Array.from(html.matchAll(/href="([^"]+)"/g), (m) =>
        m[1].replace(/&amp;/g, "&"),
    );

describe("BestCustomers", () => {
    it("an owner: initials, names that open each person, money, what they did most", () => {
        const html = draw(sellsRead());
        const said = text(html);
        expect(said).toContain("NJ Neha Joshi Shop and online ₹4,860 9 orders");
        expect(hrefs(html)).toHaveLength(5);
        expect(html.match(/data-row="customer"/g)).toHaveLength(4);
    });

    it("without payments: the same people, counts only", () => {
        const html = draw(sellsWithoutMoney());
        const said = text(html);
        expect(said).not.toMatch(/₹/);
        expect(said).toContain("Neha Joshi Shop and online 9 orders");
        expect(hrefs(html).at(-1)).toBe("/commerce/customers");
    });

    it("without names: numbered, unlinked, with what they paid", () => {
        const html = draw(sellsWithoutNames());
        const said = text(html);
        expect(said).toContain("1 Customer 1 ₹22,500 4 orders");
        expect(said).not.toContain("Shruti");
        expect(hrefs(html)).toEqual([]);
        // No initials drawn from a name nobody may read.
        expect(said).not.toMatch(/\b(SM|AM|KI|NJ)\b/);
    });

    it("nobody yet: one sentence, nothing else", () => {
        const html = draw(sellsEmpty());
        expect(html).not.toContain('data-row="customer"');
        expect(hrefs(html)).toEqual([]);
    });
});
