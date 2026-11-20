import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { Flag } from "@/lib/sites/service";
import { PrePublishChecks } from "./pre-publish-checks";
import { checkRows } from "./pre-publish-words";

vi.mock("@/lib/sites/actions", () => ({ describePhoto: vi.fn() }));

const flag = (type: Flag["type"], over: Partial<Flag> = {}): Flag => ({
    type,
    message:
        "This says ₹2,000 for Trial, but Services has ₹2,500, which is what people pay.",
    pageId: "bridal",
    sectionIndex: 1,
    field: "items",
    ...over,
});

const draw = (flags: Flag[]) =>
    renderToStaticMarkup(
        <PrePublishChecks
            siteId="site_1"
            flags={flags}
            pages={[{ id: "bridal", title: "Bridal packages" }]}
            onShow={vi.fn()}
            onChanged={vi.fn()}
        />,
    );

describe("Checked before you publish (U10)", () => {
    it("ticks every check when all is good", () => {
        const rows = checkRows([flag("missingSeoDescription")]);
        expect(rows.map((r) => [r.title, r.ok])).toEqual([
            ["Prices match Services", true],
            ["Every link works", true],
            ["Every photo has a description", true],
        ]);
    });

    it("says what is wrong, how many, and keeps a free claim on its own row", () => {
        const rows = checkRows([
            flag("priceMismatch"),
            flag("priceMismatch"),
            flag("freeClaim"),
            flag("brokenLink"),
            flag("photoNoDescription", { field: "images.0" }),
        ]);
        expect(rows.map((r) => [r.key, r.title, r.ok])).toEqual([
            ["prices", "2 prices don’t match Services", false],
            ["free", "1 “free” where Services has a price", false],
            ["links", "1 link goes nowhere", false],
            ["photos", "1 photo has no description", false],
        ]);
    });

    it("draws each problem with its fix, a photo with Describe it", () => {
        const html = draw([
            flag("priceMismatch"),
            flag("photoNoDescription", { field: "images.0" }),
        ]);
        expect(html).toContain("Checked before you publish");
        expect(html).toContain("Bridal packages · This says ₹2,000 for Trial");
        expect(html).toContain("Show me");
        expect(html).toContain("Describe it");
        expect(html).toContain("Every link works");
    });
});
