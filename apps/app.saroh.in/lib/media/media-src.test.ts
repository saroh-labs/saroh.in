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

    it("drops the userinfo, which a photo address never needs", () => {
        expect(mediaSrc("https://user:secret@cdn.example.com/a.jpg")).toBe(
            "https://cdn.example.com/a.jpg",
        );
        expect(mediaSrc("http://user@cdn.example.com/a.jpg")).toBe(
            "http://cdn.example.com/a.jpg",
        );
    });

    it("keeps an IPv6 host and a non-default port, and drops a default one", () => {
        expect(mediaSrc("https://[::1]:8443/a.jpg")).toBe(
            "https://[::1]:8443/a.jpg",
        );
        expect(mediaSrc("https://[2001:DB8::1]/a.jpg")).toBe(
            "https://[2001:db8::1]/a.jpg",
        );
        expect(mediaSrc("https://cdn.example.com:8443/a.jpg")).toBe(
            "https://cdn.example.com:8443/a.jpg",
        );
        expect(mediaSrc("https://cdn.example.com:443/a.jpg")).toBe(
            "https://cdn.example.com/a.jpg",
        );
        expect(mediaSrc("http://cdn.example.com:80/a.jpg")).toBe(
            "http://cdn.example.com/a.jpg",
        );
    });

    it("gives back a stored address byte for byte", () => {
        // The shape storage hands out: the public base, then
        // org/<id>/<purpose>/<uuid>-<file> (`buildObjectKey`).
        for (const stored of [
            "https://media.saroh.app/org/cmg1abc2d0000xyz9k3l4m5n6/product/3f6c2a1e-9b7d-4c8e-a1f2-0d9e8b7c6a5f-rosehip-face-oil.jpg",
            "https://pub-0f1e2d3c4b5a69788796a5b4c3d2e1f0.r2.dev/org/cmg1abc2d0000xyz9k3l4m5n6/media/0d9e8b7c-6a5f-4c8e-a1f2-3f6c2a1e9b7d-photo_01.webp",
        ]) {
            expect(mediaSrc(stored)).toBe(stored);
        }
    });

    it("reads a scheme in any case, and writes it in lower case", () => {
        expect(mediaSrc("HTTPS://CDN.Example.COM/A.jpg")).toBe(
            "https://cdn.example.com/A.jpg",
        );
        expect(mediaSrc("HtTp://cdn.example.com/a.jpg")).toBe(
            "http://cdn.example.com/a.jpg",
        );
        expect(mediaSrc("BLOB:https://app.saroh.in/1234")).toBe(
            "blob:https://app.saroh.in/1234",
        );
        expect(mediaSrc("JaVaScRiPt:alert(1)")).toBeUndefined();
    });

    it("never lets a control character through", () => {
        // Tabs and newlines inside are dropped, a leading C0 is trimmed,
        // and one left in the path is percent-encoded.
        expect(mediaSrc("https://cdn.example.com/a\n.jpg")).toBe(
            "https://cdn.example.com/a.jpg",
        );
        expect(mediaSrc("https://cdn.example.com/a\t.jpg")).toBe(
            "https://cdn.example.com/a.jpg",
        );
        expect(mediaSrc("\u0000 \u001fhttps://cdn.example.com/a.jpg")).toBe(
            "https://cdn.example.com/a.jpg",
        );
        expect(mediaSrc("https://cdn.example.com/a\u0000.jpg")).toBe(
            "https://cdn.example.com/a%00.jpg",
        );
        expect(mediaSrc("https://cdn.example.com/a\u007f.jpg")).toBe(
            "https://cdn.example.com/a%7F.jpg",
        );
        // A scheme split by one is still read as the scheme it spells.
        expect(mediaSrc("java\nscript:alert(1)")).toBeUndefined();
        for (const typed of [
            "https://cdn.example.com/a\r\n.jpg",
            "\u0001https://cdn.example.com/a.jpg",
            "https://cdn.example.com/a\u0008b.jpg",
        ]) {
            // eslint-disable-next-line no-control-regex
            expect(mediaSrc(typed)).not.toMatch(/[\u0000-\u001f\u007f]/);
        }
    });

    it("keeps a blob address behind blob:, whatever origin it names", () => {
        // A browser loads a blob only on the origin that made it, so one
        // naming another origin draws nothing; what matters here is that
        // it can't come out as anything but a blob.
        expect(mediaSrc("blob:https://evil.example/5f0c")).toBe(
            "blob:https://evil.example/5f0c",
        );
        expect(mediaSrc("blob:javascript:alert(1)")).toMatch(/^blob:/);
        expect(mediaSrc("blob:null/abc")).toMatch(/^blob:/);
    });
});
