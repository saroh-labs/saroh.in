import { describe, expect, it } from "vitest";

import {
    CLASS_CANCEL_REASON_MAX,
    classCancelReasonSchema,
    oneLineReason,
} from "./class-cancel-reason";

/** The API's rule for a class's cancel reason (#1172), said first. */
const problem = (reason: string) => {
    const parsed = classCancelReasonSchema.safeParse({ reason });
    return parsed.success ? null : parsed.error.issues[0]?.message;
};

describe("a class's cancel reason (#1172)", () => {
    it("is one line, trimmed", () => {
        expect(oneLineReason("  Neha is unwell.\n\n Sorry!  ")).toBe(
            "Neha is unwell. Sorry!",
        );
    });

    it("must be said", () => {
        expect(problem("")).toBe("Say why the class is cancelled");
        expect(problem("  \n ")).toBe("Say why the class is cancelled");
        expect(problem("Rain")).toBeNull();
    });

    it("is at most 200 characters once trimmed", () => {
        expect(CLASS_CANCEL_REASON_MAX).toBe(200);
        expect(problem("a".repeat(200))).toBeNull();
        expect(problem(`  ${"a".repeat(200)}  `)).toBeNull();
        expect(problem("a".repeat(201))).toBe(
            "A reason can be at most 200 characters",
        );
    });
});
