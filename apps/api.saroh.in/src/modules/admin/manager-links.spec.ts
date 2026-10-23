import { roleEnded } from "./manager-links";

const at = (iso: string) => new Date(iso);
const now = at("2026-10-19T12:00:00Z");

describe("when someone stopped holding the Account manager role (U25)", () => {
    it("holds it still: no end", () => {
        expect(
            roleEnded(
                {
                    grantRevokedAt: null,
                    assignments: [{ revokedAt: null, expiresAt: null }],
                },
                now,
            ),
        ).toBeNull();
        expect(
            roleEnded(
                {
                    grantRevokedAt: null,
                    assignments: [
                        {
                            revokedAt: null,
                            expiresAt: at("2026-10-20T00:00:00Z"),
                        },
                    ],
                },
                now,
            ),
        ).toBeNull();
    });

    it("ran out: ends when it expired, not when it was noticed", () => {
        expect(
            roleEnded(
                {
                    grantRevokedAt: null,
                    assignments: [
                        {
                            revokedAt: null,
                            expiresAt: at("2026-10-19T09:30:00Z"),
                        },
                    ],
                },
                now,
            ),
        ).toEqual({ at: at("2026-10-19T09:30:00Z"), cause: "ROLE_EXPIRED" });
    });

    it("taken away by an amend: ends when it was revoked", () => {
        expect(
            roleEnded(
                {
                    grantRevokedAt: null,
                    assignments: [
                        {
                            revokedAt: at("2026-10-18T08:00:00Z"),
                            expiresAt: null,
                        },
                    ],
                },
                now,
            ),
        ).toEqual({ at: at("2026-10-18T08:00:00Z"), cause: "ROLE_REMOVED" });
    });

    it("an expiry changed by an amend counts from the later assignment", () => {
        expect(
            roleEnded(
                {
                    grantRevokedAt: null,
                    assignments: [
                        {
                            revokedAt: at("2026-10-10T00:00:00Z"),
                            expiresAt: at("2026-10-12T00:00:00Z"),
                        },
                        {
                            revokedAt: null,
                            expiresAt: at("2026-10-19T10:00:00Z"),
                        },
                    ],
                },
                now,
            ),
        ).toEqual({ at: at("2026-10-19T10:00:00Z"), cause: "ROLE_EXPIRED" });
    });

    it("access revoked: ends when the grant was revoked", () => {
        expect(
            roleEnded(
                {
                    grantRevokedAt: at("2026-10-19T11:00:00Z"),
                    assignments: [{ revokedAt: null, expiresAt: null }],
                },
                now,
            ),
        ).toEqual({ at: at("2026-10-19T11:00:00Z"), cause: "ACCESS_REVOKED" });
    });

    it("a role that ran out before the access was revoked ended first", () => {
        expect(
            roleEnded(
                {
                    grantRevokedAt: at("2026-10-19T11:00:00Z"),
                    assignments: [
                        {
                            revokedAt: null,
                            expiresAt: at("2026-10-01T00:00:00Z"),
                        },
                    ],
                },
                now,
            ),
        ).toEqual({ at: at("2026-10-01T00:00:00Z"), cause: "ROLE_EXPIRED" });
    });

    it("no grant on record, or never the role: ends now", () => {
        expect(roleEnded(null, now)).toEqual({ at: now, cause: "LEFT_TEAM" });
        expect(
            roleEnded({ grantRevokedAt: null, assignments: [] }, now),
        ).toEqual({ at: now, cause: "ROLE_REMOVED" });
    });
});
