/**
 * What Settings → Providers is told about Saroh sending a business's
 * booking emails (DEC-086, U4: `GET comms-providers/saroh-email`,
 * `CommunicationsService.sarohEmail`) with the REAL defaults against a real
 * Postgres: the plan read through `MeteringService.enforcedRowOrThrow`, the
 * flags and the month's count as they are, nothing injected.
 *
 * The unit spec (`saroh-email-state.spec.ts`) injects every read; this
 * pins what it can't: a plan that can't be read is UNREAD (never OFF and
 * never a zero), and a business off the catalogue or with enforcement off
 * is OFF; and whether it can connect its own email (`canConnectOwn`), read
 * by the connect's own check on the plan's `integrations` row.
 *
 * Every number is made up (`fakeSarohEmailsCatalog`: Plan A, 3 a month),
 * with an `integrations` row of this file's own: locked on Plan A, 1 on
 * Plan B, 2 on Plan F, no cap elsewhere.
 * Runs in the integration project.
 */
const mockEnv: Record<string, string | undefined> = {
    PAYMENTS_ENC_KEY:
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    NODE_ENV: "test",
};
jest.mock("../../env", () => ({ env: mockEnv }));

import { prisma } from "@saroh/database";
import type { Catalog } from "@saroh/pricing-catalog";
import { parseCatalog } from "@saroh/pricing-catalog";
import { DateTime } from "luxon";

import {
    fakeSarohEmailsCatalog,
    installCatalogue,
    sarohEmailVersion,
    subscribe,
} from "../../../test/fixtures/saroh-email";
import type { OrganizationContext } from "../../common/types/organization-context";
import { CatalogueAccessService } from "../billing/catalogue-access.service";
import { FlagKey } from "../feature-flags/flags";
import { encryptSecret } from "../payments/crypto";
import { CommunicationsService } from "./communications.service";

const comms = new CommunicationsService();
const V = sarohEmailVersion();
const ZONE = "Asia/Kolkata";

let staffId: string;
let seq = 0;
const uniq = (p: string) => `${p}-${process.pid}-${++seq}`;

/** The shared catalogue with this file's own `integrations` row. */
function withIntegrations(): Catalog {
    const c = fakeSarohEmailsCatalog();
    return parseCatalog({
        ...c,
        modules: [
            ...c.modules,
            {
                id: "integrations",
                name: "Links",
                group: "g",
                cells: {
                    free: { inc: false, off: "locked" },
                    grow: { inc: true, text: "1", limit: 1 },
                    pro: { inc: true, text: "Included" },
                    soft: { inc: true, text: "Included" },
                    max: { inc: true, text: "Included" },
                    ten: { inc: true, text: "2", limit: 2 },
                },
            },
        ],
    });
}

beforeAll(async () => {
    await installCatalogue(V, withIntegrations());
    staffId = (
        await prisma.user.create({
            data: {
                email: `saroh-state-staff-${process.pid}-${Date.now()}@example.com`,
            },
        })
    ).id;
});

afterAll(async () => {
    await prisma.$disconnect();
});

async function setFlag(key: string, organizationId: string): Promise<void> {
    await prisma.featureFlag.upsert({
        where: { key },
        create: { key, enabledByDefault: false },
        update: {},
    });
    await prisma.featureFlagOverride.create({
        data: { flagKey: key, organizationId, enabled: true },
    });
}

/**
 * A business with no email provider in India, the Saroh route and plan
 * enforcement switched on for it alone, on `planId` (null: no plan, so off
 * the catalogue).
 */
async function business(
    planId: string | null = "free",
    { enforced = true }: { enforced?: boolean } = {},
): Promise<{ owner: OrganizationContext; orgId: string }> {
    const org = await prisma.organization.create({
        data: { name: "Rye & Co.", slug: uniq("saroh-state") },
    });
    if (planId) await subscribe(org.id, planId, V);
    await prisma.businessProfile.create({
        data: {
            organizationId: org.id,
            timezone: ZONE,
            contactEmail: "hello@rye.example",
        },
    });
    await setFlag(FlagKey.SAROH_BUSINESS_EMAIL, org.id);
    if (enforced) await setFlag(FlagKey.PLAN_ENFORCEMENT, org.id);
    return {
        owner: { organizationId: org.id, userId: staffId, role: "OWNER" },
        orgId: org.id,
    };
}

/** One email Saroh sent for the business this month. */
async function sentOne(organizationId: string): Promise<void> {
    const message = await prisma.message.create({
        data: {
            organizationId,
            channel: "EMAIL",
            toAddress: "asha@example.com",
            body: "x",
        },
    });
    await prisma.delivery.create({
        data: {
            organizationId,
            messageId: message.id,
            provider: "SAROH",
            status: "SENT",
            attempts: 1,
        },
    });
}

describe("Settings' Saroh email state with the real defaults (DEC-086, U4)", () => {
    it("SENDING with the month's count, the cap and the day it starts again", async () => {
        const b = await business();
        await sentOne(b.orgId);
        const restart = DateTime.now()
            .setZone(ZONE)
            .startOf("month")
            .plus({ months: 1 })
            .toFormat("d LLL");
        expect(await comms.sarohEmail(b.owner)).toEqual({
            state: "SENDING",
            used: 1,
            cap: 3,
            resetsOn: restart,
            sender: {
                name: "Rye & Co. via Saroh",
                address: "bookings@notify.saroh.in",
            },
            replyTo: "hello@rye.example",
            // Plan A leaves connecting its own email off.
            canConnectOwn: false,
        });
    });

    describe("canConnectOwn: the connect's own check on `integrations`", () => {
        /** One payment provider connected: one `integrations` connection. */
        async function paymentsConnected(organizationId: string) {
            const sealed = encryptSecret(JSON.stringify({ k: "v" }));
            await prisma.merchantPaymentProvider.create({
                data: {
                    organizationId,
                    provider: "RAZORPAY",
                    status: "CONNECTED",
                    encryptedCredentials: sealed.ciphertext,
                    credentialsIv: sealed.iv,
                    credentialsAuthTag: sealed.authTag,
                },
            });
        }

        it("false where the plan leaves it off (Plan A)", async () => {
            const b = await business("free");
            expect(await comms.sarohEmail(b.owner)).toMatchObject({
                state: "SENDING",
                canConnectOwn: false,
            });
        });

        it("true where the plan includes it with room (Plan F, one of two used)", async () => {
            const b = await business("ten");
            await paymentsConnected(b.orgId);
            expect(await comms.sarohEmail(b.owner)).toMatchObject({
                state: "SENDING",
                canConnectOwn: true,
            });
        });

        it("false at the cap (Plan B, its one connection used), as the connect refuses it", async () => {
            const b = await business("grow");
            await paymentsConnected(b.orgId);
            expect(await comms.sarohEmail(b.owner)).toMatchObject({
                state: "SENDING",
                canConnectOwn: false,
            });
            await expect(
                comms.connectProvider(b.owner, {
                    channel: "email",
                    provider: "resend",
                    credentials: { apiKey: "re_test_123" },
                }),
            ).rejects.toMatchObject({
                response: { details: { code: "PLAN_LIMIT_REACHED" } },
            });
        });

        it("null, never true, when the plan can't be read for it; the rest still stands", async () => {
            const b = await business("ten");
            const real = CatalogueAccessService.prototype.resolve;
            // The allowance's read goes through; the connect check's fails.
            const resolve = jest
                .spyOn(CatalogueAccessService.prototype, "resolve")
                .mockImplementationOnce(function (
                    this: CatalogueAccessService,
                    ...args: Parameters<CatalogueAccessService["resolve"]>
                ) {
                    return real.apply(this, args);
                })
                .mockRejectedValueOnce(new Error("down"));
            try {
                expect(await comms.sarohEmail(b.owner)).toMatchObject({
                    state: "SENDING",
                    used: 0,
                    canConnectOwn: null,
                });
            } finally {
                resolve.mockRestore();
            }
        });
    });

    it("UNREAD when the plan lookup rejects: never OFF, never a zero", async () => {
        const b = await business();
        const resolve = jest
            .spyOn(CatalogueAccessService.prototype, "resolve")
            .mockRejectedValue(new Error("down"));
        try {
            expect(await comms.sarohEmail(b.owner)).toEqual({
                state: "UNREAD",
            });
        } finally {
            resolve.mockRestore();
        }
    });

    it("OFF for a business off the catalogue (legacy)", async () => {
        const b = await business(null);
        expect(await comms.sarohEmail(b.owner)).toEqual({
            state: "OFF",
            takesOver: false,
        });
    });

    it("OFF with plan enforcement off: Saroh's sending is never unmetered", async () => {
        const b = await business("free", { enforced: false });
        expect(await comms.sarohEmail(b.owner)).toEqual({
            state: "OFF",
            takesOver: false,
        });
    });
});
