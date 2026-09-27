import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Field } from "./field";

/**
 * A block field's label names its control (G4's phone sheet found it named
 * by its placeholder instead): the label's `for` is the input's id.
 */
describe("Field", () => {
    it("points its label at a single control", () => {
        const html = renderToStaticMarkup(
            <Field label="Heading">
                <input placeholder="Welcome" />
            </Field>,
        );
        const labelFor = /<label[^>]*for="([^"]+)"/.exec(html)?.[1];
        const inputId = /<input[^>]*id="([^"]+)"/.exec(html)?.[1];
        expect(labelFor).toBeTruthy();
        expect(labelFor).toBe(inputId);
    });

    it("keeps a control's own id", () => {
        const html = renderToStaticMarkup(
            <Field label="Heading">
                <input id="hero-heading" />
            </Field>,
        );
        expect(html).toContain('for="hero-heading"');
        expect(html).toContain('id="hero-heading"');
    });

    it("leaves several controls with their own names", () => {
        const html = renderToStaticMarkup(
            <Field label="Image">
                <button type="button">Choose a photo</button>
                <input aria-label="Image address" />
            </Field>,
        );
        expect(html).not.toContain(" for=");
        expect(html).toContain("Image address");
    });
});
