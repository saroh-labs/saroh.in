import { describe, expect, it } from "vitest";

import { mediaSrc } from "./media-src";

describe("mediaSrc", () => {
    it("keeps the web and a picked file", () => {
        expect(mediaSrc("https://cdn.example.com/a.jpg")).toBe(
            "https://cdn.example.com/a.jpg",
        );
        expect(mediaSrc("http://localhost:3000/a.jpg")).toBe(
            "http://localhost:3000/a.jpg",
        );
        expect(mediaSrc("blob:https://app.saroh.in/1234")).toBe(
            "blob:https://app.saroh.in/1234",
        );
        expect(mediaSrc("https://cdn.example.com/a.jpg?w=200#x")).toBe(
            "https://cdn.example.com/a.jpg?w=200#x",
        );
    });

    it("draws nothing for script, data, a bare path or nonsense", () => {
        expect(mediaSrc("javascript:alert(1)")).toBeUndefined();
        expect(mediaSrc(" JavaScript:alert(1)")).toBeUndefined();
        expect(mediaSrc("data:text/html,<script>1</script>")).toBeUndefined();
        expect(mediaSrc("//evil.example/a.jpg")).toBeUndefined();
        expect(mediaSrc("/uploads/a.jpg")).toBeUndefined();
        expect(mediaSrc("/\\evil.example/a.jpg")).toBeUndefined();
        expect(mediaSrc("not a url")).toBeUndefined();
        expect(mediaSrc("")).toBeUndefined();
        expect(mediaSrc(null)).toBeUndefined();
    });
});
