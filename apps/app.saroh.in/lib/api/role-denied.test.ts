import { describe, expect, it } from "vitest";

import { toFailure } from "./failure";
import {
    ROLE_DENIED_FALLBACK,
    roleDeniedMessage,
    roleDeniedOf,
    roleDeniedSentence,
} from "./role-denied";

/** The API's envelope for a refusal by role (`authorize`). */
const envelope = (action?: string) => ({
    error: {
        code: "FORBIDDEN",
        message:
            "Your role can't do this. An owner or admin can change that in Settings › Team.",
        statusCode: 403,
        correlationId: "cid",
        details: { code: "ROLE_DENIED", ...(action ? { action } : {}) },
    },
});

const WHO = "An owner or admin can change this in Settings › Team.";

describe("a refusal by role, as the app says it", () => {
    it("reads the permission out of the envelope's details", () => {
        expect(roleDeniedOf(envelope("store:create").error.details)).toEqual({
            action: "store:create",
        });
        expect(roleDeniedOf({ code: "PLAN_LIMIT_REACHED" })).toBeNull();
        expect(roleDeniedOf(null)).toBeNull();
        expect(roleDeniedOf(["ROLE_DENIED"])).toBeNull();
    });

    it.each([
        ["booking:write", "Your role can't change bookings."],
        ["order:edit", "Your role can't change orders."],
        ["order:refund", "Your role can't refund or cancel orders."],
        ["store:write", "Your role can't change products or locations."],
        ["store:create", "Your role can't add a location."],
        ["contact:write", "Your role can't change customers."],
        ["invoice:write", "Your role can't make or change invoices."],
        ["section:write", "Your role can't change pages or posts."],
        ["member:invite", "Your role can't invite people."],
        ["member:role:update", "Your role can't change what people can do."],
    ])("%s has a closer sentence, and who can change it", (action, cant) => {
        expect(roleDeniedSentence(action)).toBe(`${cant} ${WHO}`);
        expect(roleDeniedMessage(envelope(action))).toBe(`${cant} ${WHO}`);
    });

    it("says only the owner can, for what only the owner holds", () => {
        expect(roleDeniedSentence("org:delete")).toBe(
            "Only the owner can do this.",
        );
        expect(roleDeniedSentence("org:address:update")).toBe(
            "Only the owner can do this.",
        );
    });

    it("falls back to the plain line for a permission with no row", () => {
        expect(roleDeniedSentence("saved-view:write")).toBe(
            ROLE_DENIED_FALLBACK,
        );
        expect(roleDeniedSentence(null)).toBe(ROLE_DENIED_FALLBACK);
        expect(roleDeniedMessage(envelope())).toBe(
            "Your role can't do this. An owner or admin can change that in Settings › Team.",
        );
    });

    it("never shows the permission's key, a role or a code", () => {
        for (const action of [
            "booking:write",
            "store:create",
            "saved-view:write",
            "org:delete",
        ]) {
            expect(roleDeniedSentence(action)).not.toMatch(
                /[a-z]:[a-z]|ROLE_DENIED|MEMBER|may not perform|[—;]/,
            );
        }
    });

    it("is not read into a refusal that isn't one", () => {
        expect(
            roleDeniedMessage({
                error: { message: "Discount not found", details: undefined },
            }),
        ).toBeNull();
        expect(roleDeniedMessage(null)).toBeNull();
        expect(roleDeniedMessage("nope")).toBeNull();
    });
});

describe("toFailure, for a refusal by role", () => {
    it("says the closer sentence and marks it a denial", () => {
        expect(toFailure(envelope("store:create"), "Could not save")).toEqual({
            ok: false,
            error: `Your role can't add a location. ${WHO}`,
            denied: true,
        });
    });

    it("keeps the API's sentence when the permission has no row", () => {
        expect(toFailure(envelope("audit:read"), "Could not load")).toEqual({
            ok: false,
            error: ROLE_DENIED_FALLBACK,
            denied: true,
        });
    });

    it("reads the bare shape too", () => {
        expect(
            toFailure(
                {
                    message: "Your role can't do this.",
                    details: { code: "ROLE_DENIED", action: "booking:write" },
                },
                "x",
            ),
        ).toEqual({
            ok: false,
            error: `Your role can't change bookings. ${WHO}`,
            denied: true,
        });
    });

    it("marks nothing else a denial: an endpoint's own sentence is an error", () => {
        const own = toFailure(
            {
                error: {
                    code: "FORBIDDEN",
                    message: "Your role changes only your own bookings.",
                    statusCode: 403,
                },
            },
            "x",
        );
        expect(own).toEqual({
            ok: false,
            error: "Your role changes only your own bookings.",
        });
        expect(toFailure(null, "Could not save.").denied).toBeUndefined();
    });
});
