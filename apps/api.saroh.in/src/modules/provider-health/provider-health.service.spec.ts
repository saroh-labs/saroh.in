import { ForbiddenException } from "@nestjs/common";

import type { OrganizationContext } from "../../common/types/organization-context";
import { ProviderHealthService } from "./provider-health.service";

const OWNER: OrganizationContext = {
    organizationId: "org_1",
    userId: "u",
    role: "OWNER",
};
const MEMBER: OrganizationContext = { ...OWNER, role: "MEMBER" };

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
    it("denies a MEMBER", async () => {
        const { svc } = make({});
        await expect(svc.list(MEMBER)).rejects.toBeInstanceOf(
            ForbiddenException,
        );
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
