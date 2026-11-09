/**
 * Flagging a payment connection (UX-012; plan 2026-11-07-002, KTD-14),
 * against a real Postgres: a Stripe key missing a side permission is
 * marked `PERMISSION_MISSING` with no "down" alert, as payments still go
 * through; a refusal later replaces it and is told once; a refusal is never
 * softened back into a missing permission. Runs in the integration project
 * (TEST_DATABASE_URL).
 */
import { prisma } from "@saroh/database";

import { TEAM_ALERT_TYPE } from "../notifications/team-alerts";
import { flagPaymentProvider } from "./provider-keys";

const tag = `${process.pid}-${Date.now()}`;
let organizationId: string;
let row: { id: string; organizationId: string };

beforeAll(async () => {
    const org = await prisma.organization.create({
        data: {
            name: "Rye Studio",
            slug: `provider-keys-${tag}`,
            edition: "GLOBAL",
            currency: "USD",
        },
    });
    organizationId = org.id;
    row = await prisma.merchantPaymentProvider.create({
        data: {
            organizationId,
            provider: "STRIPE",
            encryptedCredentials: "x",
            credentialsIv: "x",
            credentialsAuthTag: "x",
        },
        select: { id: true, organizationId: true },
    });
});

const alerts = () =>
    prisma.job.count({ where: { organizationId, type: TEAM_ALERT_TYPE } });
const reason = async () =>
    (
        await prisma.merchantPaymentProvider.findUniqueOrThrow({
            where: { id: row.id },
        })
    ).attentionReason;

it("marks a missing permission without telling anyone it's down, then lets a refusal replace it, told once", async () => {
    expect(
        await flagPaymentProvider(row, new Date(), "PERMISSION_MISSING"),
    ).toBe(true);
    expect(await reason()).toBe("PERMISSION_MISSING");
    expect(await alerts()).toBe(0);
    // Already marked: nothing new.
    expect(
        await flagPaymentProvider(row, new Date(), "PERMISSION_MISSING"),
    ).toBe(false);

    expect(await flagPaymentProvider(row)).toBe(true);
    expect(await reason()).toBe("KEYS_REFUSED");
    expect(await alerts()).toBe(1);

    // A refusal stands: neither a second refusal nor a missing permission
    // marks it again.
    expect(await flagPaymentProvider(row)).toBe(false);
    expect(
        await flagPaymentProvider(row, new Date(), "PERMISSION_MISSING"),
    ).toBe(false);
    expect(await reason()).toBe("KEYS_REFUSED");
    expect(await alerts()).toBe(1);
});
