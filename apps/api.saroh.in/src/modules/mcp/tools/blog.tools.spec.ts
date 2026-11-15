/**
 * `draft_blog_post`'s Markdown → the post editor's HTML (Tiptap stores
 * HTML in `Post.content`). The database half is `blog.tools.db.spec.ts`.
 */
import { draftBlogPostTool } from "@saroh/api-contract";

import { markdownToHtml } from "./blog.tools";

describe("markdownToHtml", () => {
    it("paragraphs, headings, lists, quotes, bold and italic", () => {
        expect(
            markdownToHtml(
                [
                    "# Eco packing",
                    "",
                    "We now pack in **recycled** paper,",
                    "and *nothing* else.",
                    "",
                    "### Why",
                    "- Less plastic",
                    "- Home compostable",
                    "",
                    "1. Order",
                    "2. Unwrap",
                    "",
                    "> Small changes add up.",
                ].join("\n"),
            ),
        ).toBe(
            "<h2>Eco packing</h2>" +
                "<p>We now pack in <strong>recycled</strong> paper, and <em>nothing</em> else.</p>" +
                "<h3>Why</h3>" +
                "<ul><li><p>Less plastic</p></li><li><p>Home compostable</p></li></ul>" +
                "<ol><li><p>Order</p></li><li><p>Unwrap</p></li></ol>" +
                "<blockquote><p>Small changes add up.</p></blockquote>",
        );
    });

    it("escapes every character of text, so no markup gets in", () => {
        expect(
            markdownToHtml('<script>alert("x")</script> & <b>bold</b>'),
        ).toBe(
            "<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &lt;b&gt;bold&lt;/b&gt;</p>",
        );
    });

    it("leaves snake_case words and lone asterisks alone", () => {
        expect(markdownToHtml("snake_case_words cost 5 * 2")).toBe(
            "<p>snake_case_words cost 5 * 2</p>",
        );
    });

    it("plain text with no Markdown is paragraphs", () => {
        expect(markdownToHtml("One.\r\n\r\nTwo.")).toBe(
            "<p>One.</p><p>Two.</p>",
        );
    });
});

describe("draft_blog_post's input", () => {
    const ok = { request_id: "r1", title: "Eco packing", body: "Hello" };

    it("caps the title at 120 and the body at 20,000 characters", () => {
        const input = draftBlogPostTool.input;
        expect(input.safeParse(ok).success).toBe(true);
        expect(input.safeParse({ ...ok, title: "x".repeat(121) }).success).toBe(
            false,
        );
        expect(
            input.safeParse({ ...ok, body: "x".repeat(20_001) }).success,
        ).toBe(false);
        expect(input.safeParse({ ...ok, title: "  " }).success).toBe(false);
    });

    it("takes no status: it can't publish", () => {
        expect(
            draftBlogPostTool.input.safeParse({ ...ok, status: "PUBLISHED" })
                .success,
        ).toBe(false);
    });
});
