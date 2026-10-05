import {
    businessKey,
    cleanSource,
    maskEmail,
    newRefCode,
    normaliseEmail,
    REF_CODE_PATTERN,
} from "./waitlist-keys";

describe("normaliseEmail", () => {
    it("keeps the address as typed, trimmed and lower-cased", () => {
        expect(normaliseEmail("  Founder@Example.TEST ").email).toBe(
            "founder@example.test",
        );
    });

    it("reads A.B+x@gmail.com as ab@gmail.com", () => {
        expect(normaliseEmail("A.B+x@Gmail.com").key).toBe("ab@gmail.com");
        expect(normaliseEmail("ab@gmail.com").key).toBe("ab@gmail.com");
    });

    it("folds googlemail into gmail", () => {
        expect(normaliseEmail("a.b@googlemail.com").key).toBe("ab@gmail.com");
    });

    it("drops a +tag everywhere but keeps dots outside Gmail", () => {
        expect(normaliseEmail("first.last+news@shop.in").key).toBe(
            "first.last@shop.in",
        );
    });

    it("leaves something that is not an address alone", () => {
        expect(normaliseEmail("nobody").key).toBe("nobody");
    });
});

describe("businessKey", () => {
    it("compares names without case or extra spaces", () => {
        expect(businessKey("  Glow   Studio ")).toBe("glow studio");
        expect(businessKey("GLOW STUDIO")).toBe(businessKey("glow studio"));
    });

    it("is empty when there is no name (the V1 form)", () => {
        expect(businessKey(undefined)).toBe("");
    });
});

describe("newRefCode", () => {
    it("is eight unambiguous characters", () => {
        for (let i = 0; i < 50; i += 1) {
            expect(newRefCode()).toMatch(REF_CODE_PATTERN);
        }
    });
});

describe("cleanSource", () => {
    it("is direct when the page named none", () => {
        expect(cleanSource(undefined)).toBe("direct");
        expect(cleanSource("  ")).toBe("direct");
    });

    it("keeps a plain source and strips the rest", () => {
        expect(cleanSource("Instagram")).toBe("instagram");
        expect(cleanSource("home-hero")).toBe("home-hero");
        expect(cleanSource("<script>")).toBe("script");
    });
});

describe("maskEmail", () => {
    it("keeps the first character and a fixed mask", () => {
        expect(maskEmail("founder@example.test")).toBe("f***@example.test");
    });

    it("shows neither a short local part nor its length", () => {
        expect(maskEmail("ab@example.test")).toBe("a***@example.test");
        expect(maskEmail("a@example.test")).toBe("a***@example.test");
        expect(maskEmail("abcdefghijkl@example.test")).toBe(
            "a***@example.test",
        );
    });
});
