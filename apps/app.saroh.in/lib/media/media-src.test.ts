import { describe, expect, it } from "vitest";

import { mediaSrc } from "./media-src";

describe("mediaSrc", () => {
    it("keeps the web, a picked file, and a path on this site", () => {
        expect(mediaSrc("https://cdn.example.com/a.jpg")).toBe(
            "https://cdn.example.com/a.jpg",
        );
        expect(mediaSrc("http://localhost:3000/a.jpg")).toBe(
            "http://localhost:3000/a.jpg",
        );
        expect(mediaSrc("blob:https://app.saroh.in/1234")).toBe(
            "blob:https://app.saroh.in/1234",
        );
        expect(mediaSrc("/uploads/a.jpg")).toBe("/uploads/a.jpg");
        expect(mediaSrc("https://cdn.example.com/a.jpg?w=200#x")).toBe(
            "https://cdn.example.com/a.jpg?w=200#x",
        );
    });

    it("draws nothing for script, data, a protocol-relative host or nonsense", () => {
        expect(mediaSrc("javascript:alert(1)")).toBeUndefined();
        expect(mediaSrc(" JavaScript:alert(1)")).toBeUndefined();
        expect(mediaSrc("data:text/html,<script>1</script>")).toBeUndefined();
        expect(mediaSrc("//evil.example/a.jpg")).toBeUndefined();
        expect(mediaSrc("not a url")).toBeUndefined();
        expect(mediaSrc("")).toBeUndefined();
        expect(mediaSrc(null)).toBeUndefined();
    });
});
