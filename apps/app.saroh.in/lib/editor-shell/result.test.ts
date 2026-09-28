import { describe, expect, it } from "vitest";

import { editorFailure, readConflict } from "./result";

describe("reading a refused draft write", () => {
    it("reads D5's stale-revision 409 as a conflict naming who", () => {
        const body = {
            error: {
                code: "CONFLICT",
                message: "Someone else changed this plan.",
                statusCode: 409,
                details: {
                    yours: 4,
                    current: 5,
                    changedBy: { id: "u1", name: "Priya Raman" },
                    changedAt: "2026-10-03T09:12:00.000Z",
                },
            },
        };
        expect(editorFailure(409, body, "Couldn't save")).toEqual({
            ok: false,
            error: "Someone else changed this plan.",
            conflict: {
                changedBy: "Priya Raman",
                changedAt: "2026-10-03T09:12:00.000Z",
                current: 5,
            },
        });
    });

    it("takes the name as a plain string too, and never an empty one", () => {
        expect(
            readConflict(409, {
                details: { current: 5, changedBy: "Priya" },
            })?.changedBy,
        ).toBe("Priya");
        expect(
            readConflict(409, { details: { current: 5, changedBy: "  " } }),
        ).toEqual({ changedBy: null, changedAt: null, current: 5 });
    });

    it("keeps any other 409 an ordinary refusal", () => {
        const body = {
            error: {
                message: "This plan isn't published yet",
                details: { field: "status" },
            },
        };
        expect(editorFailure(409, body, "Couldn't save")).toEqual({
            ok: false,
            error: "This plan isn't published yet",
            field: "status",
        });
        expect(readConflict(409, { error: { message: "x" } })).toBeNull();
    });

    it("never reads a conflict off another status", () => {
        expect(
            readConflict(400, { details: { current: 5, changedBy: "P" } }),
        ).toBeNull();
        expect(
            editorFailure(
                400,
                {
                    error: {
                        message: "There's already a plan called Monthly",
                        details: { field: "name" },
                    },
                },
                "Couldn't save",
            ),
        ).toEqual({
            ok: false,
            error: "There's already a plan called Monthly",
            field: "name",
        });
    });

    it("falls back to the caller's words when the body says nothing", () => {
        expect(editorFailure(500, null, "Couldn't save the plan")).toEqual({
            ok: false,
            error: "Couldn't save the plan",
        });
    });
});
