import { ForbiddenException } from "@nestjs/common";

import type { OrganizationContext } from "../../common/types/organization-context";
import { ProviderHealthService } from "./provider-health.service";

const OWNER: OrganizationContext = {
    organizationId: "org_1",
    userId: "u",
    role: "OWNER",
};
const ADMIN: OrganizationContext = { ...OWNER, role: "ADMIN" };
const MEMBER: OrganizationContext = { ...OWNER, role: "MEMBER" };
const REVIEWER: OrganizationContext = { ...OWNER, role: "REVIEWER" };

function make(data: {
    payments?: { status: string }[];
    comms?: { status: string }[];
    domains?: { status: string }[];
}) {
    const db = {
        merchantPaymentProvider: {
            findMany: jest.fn().mockResolvedValue(data.payments ?? []),
        },
        communicationProvider: {
            findMany: jest.fn().mockResolvedValue(data.comms ?? []),
        },
        domain: { findMany: jest.fn().mockResolvedValue(data.domains ?? []) },
    };
    return { svc: new ProviderHealthService(db as never), db };
}

const byKey = (list: { key: string; status: string }[], key: string) =>
    list.find((h) => h.key === key);

describe("ProviderHealthService", () => {
    /*
     * Every role, not only the one that was thought of first.
     *
     * The check used to be `role === "MEMBER"`, and this test was `denies a
     * MEMBER`, so the pair agreed with each other and with nothing else:
     * REVIEWER, added later (#276), read straight through and saw which payment
     * and messaging providers the business runs on (#313). A table over all
     * four roles is what makes the next role a decision rather than an
     * oversight.
     */
    it.each([
        ["OWNER", OWNER, true],
        ["ADMIN", ADMIN, true],
        ["MEMBER", MEMBER, false],
        ["REVIEWER", REVIEWER, false],
    ] as const)("%s may read provider health: %s", async (_name, ctx, may) => {
        const { svc } = make({});
        if (may) {
            await expect(svc.list(ctx)).resolves.toBeInstanceOf(Array);
        } else {
            await expect(svc.list(ctx)).rejects.toBeInstanceOf(
                ForbiddenException,
            );
        }
    });

    it("does not touch a row for a role that may not read", async () => {
        // The refusal comes before the query, so a denied read is not also a
        // database round trip.
        const { svc, db } = make({});
        await expect(svc.list(REVIEWER)).rejects.toBeInstanceOf(
            ForbiddenException,
        );
        expect(db.merchantPaymentProvider.findMany).not.toHaveBeenCalled();
    });

    it("reports NOT_CONFIGURED with nothing connected", async () => {
        const { svc } = make({});
        const health = await svc.list(OWNER);
        expect(byKey(health, "PAYMENTS")?.status).toBe("NOT_CONFIGURED");
        expect(byKey(health, "COMMUNICATIONS")?.status).toBe("NOT_CONFIGURED");
        expect(byKey(health, "DOMAINS")?.status).toBe("NOT_CONFIGURED");
    });

    it("reports ACTIVE for a connected provider and DEGRADED when disabled", async () => {
        const { svc } = make({
            payments: [{ status: "CONNECTED" }],
            comms: [{ status: "DISABLED" }],
        });
        const health = await svc.list(OWNER);
        expect(byKey(health, "PAYMENTS")?.status).toBe("ACTIVE");
        expect(byKey(health, "COMMUNICATIONS")?.status).toBe("DEGRADED");
    });

    it("distinguishes domain PENDING and FAILED", async () => {
        expect(
            byKey(
                await make({ domains: [{ status: "PENDING" }] }).svc.list(
                    OWNER,
                ),
                "DOMAINS",
            )?.status,
        ).toBe("PENDING");
        expect(
            byKey(
                await make({
                    domains: [{ status: "VERIFIED" }, { status: "FAILED" }],
                }).svc.list(OWNER),
                "DOMAINS",
            )?.status,
        ).toBe("FAILED");
    });

    it("never selects or returns credential fields", async () => {
        const { svc, db } = make({ payments: [{ status: "CONNECTED" }] });
        const health = await svc.list(OWNER);
        // The queries select ONLY status — no credential columns.
        const select =
            db.merchantPaymentProvider.findMany.mock.calls[0][0].select;
        expect(Object.keys(select)).toEqual(["status"]);
        // And nothing in the output looks like a secret.
        const json = JSON.stringify(health).toLowerCase();
        expect(json).not.toContain("credential");
        expect(json).not.toContain("secret");
    });
});
