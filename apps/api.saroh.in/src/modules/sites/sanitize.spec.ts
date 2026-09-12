import { sanitizeRichHtml, sanitizeSectionContent } from "./sanitize";

/**
 * The sanitizer's allowlist is a contract with two sides (#280). What it
 * strips, it must strip: script, handlers, unsafe links, page-covering CSS.
 * What the rich text editor writes, it must keep, or a merchant's formatting
 * vanishes on save with no error anywhere.
 */
describe("sanitizeRichHtml", () => {
    it("strips script, its contents, and event handlers", () => {
        const out = sanitizeRichHtml(
            '<p onclick="steal()">Hi</p><img src="https://img.test/a.png" onerror="alert(1)"><script>alert(2)</script>',
        );
        expect(out).toContain("<p>Hi</p>");
        expect(out).not.toMatch(/onclick|onerror|steal|alert|script/);
    });

    it("drops a javascript: link but keeps web, email and phone links", () => {
        const out = sanitizeRichHtml(
            '<a href="javascript:alert(1)">x</a><a href="https://northwind.test">w</a><a href="mailto:hi@northwind.test">e</a><a href="tel:+919800000000">t</a>',
        );
        expect(out).not.toMatch(/javascript/);
        expect(out).toContain('href="https://northwind.test"');
        expect(out).toContain('href="mailto:hi@northwind.test"');
        expect(out).toContain('href="tel:+919800000000"');
    });

    it("keeps the highlight the editor draws, which publish used to strip", () => {
        const out = sanitizeRichHtml(
            '<p><mark data-color="#fef08a" style="background-color: #fef08a; color: inherit">note</mark></p>',
        );
        expect(out).toContain("<mark");
        expect(out).toContain('data-color="#fef08a"');
        expect(out).toMatch(/background-color:\s*#fef08a/);
    });

    it("keeps the editor's colour, font, size and alignment", () => {
        const out = sanitizeRichHtml(
            '<p style="text-align: center"><span style="color: #b91c1c; font-family: Georgia, \'Times New Roman\', serif; font-size: 1.25rem">Order by 2pm</span></p>',
        );
        expect(out).toMatch(/text-align:\s*center/);
        expect(out).toMatch(/color:\s*#b91c1c/);
        expect(out).toMatch(/font-family:\s*Georgia/);
        expect(out).toMatch(/font-size:\s*1\.25rem/);
    });

    it("drops CSS the editor never writes, so a draft cannot cover the page", () => {
        const out = sanitizeRichHtml(
            '<div style="position: fixed; inset: 0; z-index: 9999; background-color: #ffffff; background-image: url(https://x.test/a.png)">x</div>',
        );
        expect(out).not.toMatch(
            /position|inset|z-index|background-image|url\(/,
        );
        expect(out).toMatch(/background-color:\s*#ffffff/);
    });

    it("drops a colour value that is not a colour", () => {
        const out = sanitizeRichHtml(
            '<span style="color: expression(alert(1))">x</span>',
        );
        expect(out).not.toMatch(/expression|alert/);
    });

    it("opens any targeted link in a new tab with noopener", () => {
        const out = sanitizeRichHtml(
            '<a href="https://northwind.test" target="_top">x</a>',
        );
        expect(out).toContain('target="_blank"');
        expect(out).toContain('rel="noopener noreferrer"');
    });

    it("keeps table cell spans", () => {
        const out = sanitizeRichHtml(
            '<table><tbody><tr><td colspan="2" rowspan="1">x</td></tr></tbody></table>',
        );
        expect(out).toContain('colspan="2"');
    });

    it("is stable on a second pass, so sanitizing on save and again at publish changes nothing", () => {
        const once = sanitizeRichHtml(
            '<p style="text-align: right"><mark data-color="#bbf7d0" style="background-color: #bbf7d0; color: inherit">a &lt; b</mark> <a href="https://x.test" target="_blank">link</a></p>',
        );
        expect(sanitizeRichHtml(once)).toBe(once);
    });
});

describe("sanitizeSectionContent", () => {
    it("cleans only the contract's flagged fields, and never mutates the input", () => {
        const input = {
            format: "html",
            value: '<p onclick="x()">Hi</p>',
            heading: "<b onclick=x>text</b>",
        };
        const out = sanitizeSectionContent(input, ["value"]) as typeof input;
        expect(out.value).toBe("<p>Hi</p>");
        expect(out.heading).toBe("<b onclick=x>text</b>");
        expect(input.value).toBe('<p onclick="x()">Hi</p>');
    });
});
