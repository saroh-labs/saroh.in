import { describe, expect, it } from "vitest";

import { postParagraphs } from "./plain-text";

describe("a post's body as plain paragraphs", () => {
    it("reads blocks as paragraphs and drops the tags", () => {
        expect(
            postParagraphs(
                "<h2>Winter hours</h2><p>From <strong>1 December</strong> we close at 6.</p><p>See you &amp; yours.<br>Asha</p>",
            ),
        ).toEqual([
            "Winter hours",
            "From 1 December we close at 6.",
            "See you & yours.",
            "Asha",
        ]);
    });

    it("drops a script or a style with what is inside it, whatever its case", () => {
        expect(
            postParagraphs(
                '<p>Hello</p><SCRIPT type="x">alert(1)</SCRIPT><style>p{color:red}</style><p>there</p>',
            ),
        ).toEqual(["Hello", "there"]);
        // One that never closes takes the rest with it.
        expect(postParagraphs("<p>Hello</p><script>alert(1)")).toEqual([
            "Hello",
        ]);
    });

    it("leaves no tag behind when one is hidden inside another", () => {
        for (const body of [
            "<scr<script>ipt>alert(1)</scr</script>ipt>",
            "<<script>script>alert(1)<</script>/script>",
            "<p>ok</p><scri<script></script>pt>alert(1)</script>",
            "<img src=x onerror=alert(1)",
        ]) {
            const said = postParagraphs(body).join("\n");
            expect(said).not.toMatch(/[<>]/);
            expect(said.toLowerCase()).not.toContain("<script");
        }
    });

    it("keeps a word that only starts like one", () => {
        expect(
            postParagraphs("<p><scripture>Psalm 23</scripture></p>"),
        ).toEqual(["Psalm 23"]);
    });

    it("reads entities once, so an escaped bracket stays text", () => {
        expect(postParagraphs("<p>3 &lt; 5 and &amp;lt; stays</p>")).toEqual([
            "3 < 5 and &lt; stays",
        ]);
    });

    it("is nothing for nothing", () => {
        expect(postParagraphs(null)).toEqual([]);
        expect(postParagraphs("")).toEqual([]);
        expect(postParagraphs("<p> </p>")).toEqual([]);
    });
});
