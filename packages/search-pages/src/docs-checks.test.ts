import { describe, expect, it } from "vitest";

import { docPageChecks, GST_CHECKED_MAX_DAYS } from "./checks";
import { embeddedDocs } from "./docs-embedded";
import type { DocPage } from "./docs-load";

const TODAY = "2026-10-31";
const errors = (p: DocPage, today = TODAY) =>
    docPageChecks(p, { today })
        .filter((c) => !c.ok && c.severity === "error")
        .map((c) => c.id);

/** A copy of a fixture with its facts confirmed. */
function confirmed(kind: DocPage["kind"]): DocPage {
    const p = embeddedDocs.list(kind)[0];
    if (!p) throw new Error(`no ${kind} fixture`);
    return structuredClone({ ...p, toConfirm: [] });
}

describe("docPageChecks", () => {
    it.each(embeddedDocs.all().map((p) => [p.path, p] as const))(
        "%s is held back only by its facts to confirm",
        (_, p) => {
            expect(p.toConfirm.length).toBeGreaterThan(0);
            expect(errors(p)).toEqual(["to-confirm"]);
            const c = docPageChecks(p, { today: TODAY }).find(
                (x) => x.id === "to-confirm",
            );
            for (const item of p.toConfirm) expect(c?.detail).toContain(item);
        },
    );

    it.each(["gst", "guides", "downloads"] as const)(
        "a %s page with its facts confirmed passes",
        (kind) => {
            expect(errors(confirmed(kind))).toEqual([]);
        },
    );

    it(`fails a GST page checked more than ${GST_CHECKED_MAX_DAYS} days ago`, () => {
        const p = confirmed("gst");
        if (p.kind !== "gst") throw new Error("not gst");
        p.checkedOn = "2026-05-03"; // 181 days before TODAY
        expect(errors(p)).toEqual(["checked-on"]);
        p.checkedOn = "2026-05-04";
        expect(errors(p)).toEqual([]);
    });

    it("fails a download whose file isn't in its folder, or isn't its format", () => {
        const p = confirmed("downloads");
        if (p.kind !== "downloads") throw new Error("not a download");
        p.files = [
            { name: "customer-list.xlsx", format: "Excel", bytes: null },
            { name: "customer-list.csv", format: "PDF", bytes: 81 },
        ];
        const c = docPageChecks(p, { today: TODAY }).find(
            (x) => x.id === "files",
        );
        expect(c?.ok).toBe(false);
        expect(c?.detail).toContain("customer-list.xlsx isn't there.");
        expect(c?.detail).toContain(
            "customer-list.csv isn't a PDF file (.pdf).",
        );
    });

    it.each([
        ["Saroh's price", "Saroh costs ₹999 a month for this", "no-price"],
        ["a Saroh plan", "You get this on the Grow plan", "no-price"],
        [
            "a claim Saroh can't make",
            "Saroh sends the reminders for you",
            "claims",
        ],
        ["a placeholder", "Written by [Author name]", "placeholders"],
    ])("fails a page that names %s", (_, words, id) => {
        const p = confirmed("guides");
        if (p.kind !== "guides") throw new Error("not a guide");
        p.lead = words;
        expect(errors(p)).toEqual([id]);
    });

    it("keeps ₹ amounts that aren't Saroh's", () => {
        const p = confirmed("gst");
        expect(
            docPageChecks(p, { today: TODAY }).find((c) => c.id === "no-price")
                ?.ok,
        ).toBe(true);
    });

    it("fails a quote mark facing the wrong way, and passes curly quotes", () => {
        const p = confirmed("gst");
        p.name = "What “without input tax credit” means";
        expect(errors(p)).toEqual([]);
        p.name = "What ”without input tax credit” means";
        expect(errors(p)).toEqual(["quotes"]);
        p.name = "What “without input tax credit“ means";
        expect(errors(p)).toEqual(["quotes"]);
    });
});
