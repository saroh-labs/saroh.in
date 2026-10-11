import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LeadsViewSwitch } from "./leads-view-switch";

/**
 * Leads' Board | List switch: the pipeline board and the leads list are two
 * views of the same leads, so both carry it, each marking itself and
 * linking to the other. Each used to reach the other by a loose button.
 */
describe("the leads view switch", () => {
    const link = (html: string, href: string) =>
        new RegExp(`<a[^>]*href="${href}"[^>]*>`).exec(html)?.[0] ?? "";

    it("marks the board and links to the list", () => {
        const html = renderToStaticMarkup(<LeadsViewSwitch current="board" />);
        expect(html).toContain('aria-label="Leads view"');
        expect(link(html, "/pipeline")).toContain('aria-current="page"');
        expect(link(html, "/pipeline")).toContain('data-state="on"');
        expect(link(html, "/leads")).not.toContain("aria-current");
        expect(link(html, "/leads")).toContain('data-state="off"');
        expect(html).toContain(">Board<");
        expect(html).toContain(">List<");
    });

    it("marks the list and links to the board", () => {
        const html = renderToStaticMarkup(<LeadsViewSwitch current="list" />);
        expect(link(html, "/leads")).toContain('aria-current="page"');
        expect(link(html, "/leads")).toContain('data-state="on"');
        expect(link(html, "/pipeline")).not.toContain("aria-current");
        expect(link(html, "/pipeline")).toContain('data-state="off"');
    });
});
