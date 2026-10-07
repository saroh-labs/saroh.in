import { InternalServerErrorException } from "@nestjs/common";
import { listTemplates } from "@saroh/templates";

import { planTemplateFooter } from "./site-create";

/**
 * The footer a site made from a template starts with (industry templates,
 * polish pass): the template's line as plain text, laid out as it says.
 */
describe("planTemplateFooter", () => {
    const template = { id: "bakery", version: 1 };

    it("writes the line as plain text in the template's layout", () => {
        expect(
            planTemplateFooter({
                ...template,
                footer: {
                    line: "14 Hill Road, Bandra West · Closed Mondays",
                    layout: "left",
                },
            }),
        ).toEqual({
            format: "markdown",
            value: "14 Hill Road, Bandra West · Closed Mondays",
            layout: "left",
        });
    });

    it("keeps a left layout with no line, and writes nothing for none", () => {
        expect(
            planTemplateFooter({ ...template, footer: { layout: "left" } }),
        ).toEqual({ format: "markdown", value: "", layout: "left" });
        expect(planTemplateFooter({ ...template, footer: {} })).toBeUndefined();
        expect(planTemplateFooter(template)).toBeUndefined();
    });

    it("reports a template's broken footer as a server bug", () => {
        expect(() =>
            planTemplateFooter({
                ...template,
                footer: { line: "x".repeat(10_001) },
            }),
        ).toThrow(InternalServerErrorException);
    });

    it("plans a footer for every registered template that sets one", () => {
        for (const t of listTemplates()) {
            if (t.footer?.line) {
                expect(planTemplateFooter(t)?.value).toBe(t.footer.line);
            }
        }
    });
});
