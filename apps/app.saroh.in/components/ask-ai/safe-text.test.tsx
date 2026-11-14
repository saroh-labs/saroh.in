import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SafeText } from "./safe-text";

/**
 * What Ask AI writes is drawn as text (plan 2026-11-13-001 U10,
 * Rendering): paragraphs, lists and bold only. An image, a link or raw
 * HTML in an answer stays inert text: no <img>, no <a>, no element the
 * model named, so nothing loads from an outside host.
 */
const html = (text: string) => renderToStaticMarkup(<SafeText text={text} />);

describe("SafeText", () => {
    it("draws an image or a link the model wrote as plain text", () => {
        const out = html(
            "Look: ![chart](https://evil.example/x.png) and [pay here](https://evil.example/pay) or https://evil.example",
        );
        expect(out).not.toContain("<img");
        expect(out).not.toContain("<a");
        expect(out).not.toContain("href");
        expect(out).toContain("![chart](https://evil.example/x.png)");
        expect(out).toContain("[pay here](https://evil.example/pay)");
    });

    it("escapes raw HTML rather than drawing it", () => {
        const out = html(
            '<img src="https://evil.example/t.gif" onerror="alert(1)"><script>x</script><a href="https://evil.example">x</a>',
        );
        expect(out).not.toMatch(/<(img|script|a)\b/);
        expect(out).toContain("&lt;img");
        expect(out).toContain("&lt;script&gt;");
    });

    it("keeps paragraphs, lists and bold", () => {
        const out = html(
            "**46** bookings this week.\n\nBy day:\n- Saturday **13**\n- Sunday 9\n\n1. Haircut\n2. Hair spa",
        );
        expect(out).toContain("<strong");
        expect(out).toContain(">46</strong>");
        expect(out).toMatch(
            /<ul[^>]*><li>Saturday <strong[^>]*>13<\/strong><\/li><li>Sunday 9<\/li><\/ul>/,
        );
        expect(out).toMatch(
            /<ol[^>]*><li>Haircut<\/li><li>Hair spa<\/li><\/ol>/,
        );
        expect(out.match(/<p/g)).toHaveLength(2);
    });
});
