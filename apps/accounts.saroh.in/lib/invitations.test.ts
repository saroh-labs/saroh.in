import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({
    env: {
        NEXT_PUBLIC_BETTER_AUTH_URL: "https://api.example.test",
        NODE_ENV: "test",
    },
}));

import {
    getInvitation,
    INVITATION_GONE,
    INVITATION_UNREACHABLE,
    invitationReadStatus,
    ROLE_MEANS,
} from "./invitations";

/**
 * Reading an invitation before sign-in (UX audit, 10 Oct). A failure to
 * reach the API was shown as "This invitation is no longer valid", which is
 * not true: nothing was checked.
 */

const PREVIEW = {
    organizationName: "Asha's Salon",
    invitedByName: "Asha",
    role: "MEMBER",
    email: "ravi@example.com",
};

function answer(status: number, body: unknown = {}) {
    return vi.fn().mockResolvedValue(
        new Response(JSON.stringify(body), {
            status,
            headers: { "content-type": "application/json" },
        }),
    );
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("invitationReadStatus", () => {
    it("is found for a success", () => {
        expect(invitationReadStatus(200)).toBe("found");
    });

    it("is gone for the API's one answer to an invitation it cannot show", () => {
        expect(invitationReadStatus(404)).toBe("gone");
        expect(invitationReadStatus(410)).toBe("gone");
        expect(invitationReadStatus(400)).toBe("gone");
    });

    it("is unreachable for an API that failed to answer the question", () => {
        for (const status of [500, 502, 503, 504, 429, 403, 401]) {
            expect(invitationReadStatus(status), String(status)).toBe(
                "unreachable",
            );
        }
    });
});

describe("getInvitation", () => {
    it("returns the invitation it read, uncached, by its token", async () => {
        const fetch = answer(200, PREVIEW);
        vi.stubGlobal("fetch", fetch);

        await expect(getInvitation("tok/en")).resolves.toEqual({
            status: "found",
            invitation: PREVIEW,
        });
        expect(fetch).toHaveBeenCalledWith(
            "https://api.example.test/public/organization-invitations/tok%2Fen",
            { cache: "no-store" },
        );
    });

    it("is gone when the API says there is no such invitation", async () => {
        vi.stubGlobal("fetch", answer(404));

        await expect(getInvitation("abc")).resolves.toEqual({
            status: "gone",
        });
    });

    it("is unreachable, not gone, when the API is down", async () => {
        vi.stubGlobal("fetch", answer(503));

        await expect(getInvitation("abc")).resolves.toEqual({
            status: "unreachable",
        });
    });

    it("is unreachable, not gone, when the request never arrives", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockRejectedValue(new TypeError("fetch failed")),
        );

        await expect(getInvitation("abc")).resolves.toEqual({
            status: "unreachable",
        });
    });

    it("is unreachable when a success is not the JSON it claims to be", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(new Response("<html>", { status: 200 })),
        );

        await expect(getInvitation("abc")).resolves.toEqual({
            status: "unreachable",
        });
    });
});

describe("what the two failed states say", () => {
    it("never calls an unchecked invitation invalid", () => {
        expect(INVITATION_UNREACHABLE.title).toBe(
            "Couldn't check this invitation",
        );
        expect(INVITATION_UNREACHABLE.description).toBe(
            "Try again in a moment. The invitation itself is untouched.",
        );
        expect(
            `${INVITATION_UNREACHABLE.title} ${INVITATION_UNREACHABLE.description}`,
        ).not.toMatch(/no longer|invalid|expired/i);
    });

    it("has one title for withdrawn, used and expired", () => {
        expect(INVITATION_GONE.title).toBe(
            "This invitation can no longer be used",
        );
        expect(INVITATION_GONE.description).toBe(
            "It was withdrawn, already used, or has expired. Ask whoever sent it for a new one.",
        );
    });
});

describe("ROLE_MEANS", () => {
    it("says location and business, never storefront or workspace", () => {
        for (const line of Object.values(ROLE_MEANS)) {
            expect(line).not.toMatch(/storefront|workspace|organi[sz]ation/i);
        }
        expect(ROLE_MEANS.MEMBER).toContain("their own location");
    });
});
