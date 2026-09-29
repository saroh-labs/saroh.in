import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ClassWaitlistRow } from "@/lib/services/class-waitlist-words";

import { ClassWaitlist } from "./class-waitlist";

/**
 * A class's waitlist on its booking (round-2 A12): the line in order, a
 * held place first and said as such, each person a link to their page —
 * and a failed read said as a failure, never as nobody waiting.
 */
const text = (html: string) =>
    html
        .replace(/<[^>]+>/g, "|")
        .split("|")
        .map((s) => s.replace(/&#x27;/g, "'").trim())
        .filter(Boolean);

const row = (over: Partial<ClassWaitlistRow>): ClassWaitlistRow => ({
    id: "w_1",
    contactId: "c_1",
    name: "Bina Shah",
    email: "bina@example.in",
    status: "WAITING",
    offeredUntil: null,
    joinedAt: "2026-09-28T06:00:00.000Z",
    ...over,
});

describe("ClassWaitlist", () => {
    it("lists the line in order, the held place first, each linked", () => {
        const html = renderToStaticMarkup(
            <ClassWaitlist
                timezone="Asia/Kolkata"
                rows={[
                    row({
                        id: "w_1",
                        contactId: "c_bina",
                        status: "OFFERED",
                        offeredUntil: "2026-10-05T09:00:00.000Z",
                    }),
                    row({ id: "w_2", contactId: "c_chetan", name: "Chetan" }),
                    row({ id: "w_3", contactId: "c_x", name: null }),
                ]}
            />,
        );
        expect(text(html)).toEqual([
            "Waitlist",
            "3",
            "When a place frees up, the first in line has it held for up to 2 hours to book.",
            "1",
            "Bina Shah",
            "Place held until 14:30",
            "Offered",
            "2",
            "Chetan",
            "Since 28 Sep",
            "3",
            "bina@example.in",
            "Since 28 Sep",
        ]);
        expect(html).toContain('href="/customers/c_bina"');
        expect(html).toContain('href="/customers/c_chetan"');
    });

    it("says nobody is waiting", () => {
        const html = renderToStaticMarkup(
            <ClassWaitlist timezone="Asia/Kolkata" rows={[]} />,
        );
        expect(text(html)).toContain("Nobody waiting.");
    });

    it("says a failed read failed, never that nobody is waiting", () => {
        const html = renderToStaticMarkup(
            <ClassWaitlist timezone="Asia/Kolkata" rows={null} />,
        );
        expect(text(html)).toContain(
            "We couldn't load the waitlist. Refresh the page to try again.",
        );
        expect(text(html)).not.toContain("Nobody waiting.");
    });
});
