import { isThrowawayDatabase } from "./data";
import type { Db } from "./helpers";

/**
 * Provider connections the seed can't really make (9 Oct).
 *
 * The seed never fabricates a usable credential, so every provider row it
 * writes holds {@link PLACEHOLDER_CREDENTIALS}, which the API can't open.
 * A row like that marked CONNECTED is a stand-in: the workspace shows the
 * provider as connected and the site offers to take money online, yet
 * checkout fails as soon as the API opens the keys, and every email the
 * business sends through its own provider fails on each retry ("Invalid
 * authentication tag length").
 *
 * - On a throwaway database (this machine's, or CI's), the stand-ins stay:
 *   the browser specs and the demo films need a business that reads as
 *   connected (Pay now offered, a pay link made, Send naming email), and
 *   they stub the provider's side in the browser, so nothing opens the
 *   keys there.
 * - On a shared database (the dev environment's) they would only lie, so
 *   none is written, and one an earlier seed left is removed. A connection
 *   someone made there with real keys has other credentials, so it is
 *   never touched. The business then reads as not connected, and real
 *   test keys can be connected through Settings › Providers.
 *
 * A DISABLED row with the placeholders is honest anywhere (it says the
 * provider is off, and nothing opens a disabled connection), so it is
 * written straight, not through here.
 */

/** Stand-in sealed credentials: not a credential, and unopenable. */
export const PLACEHOLDER_CREDENTIALS = {
    encryptedCredentials: "seed-not-a-real-credential",
    credentialsIv: "seed-iv",
    credentialsAuthTag: "seed-tag",
} as const;

/** Whether the seed writes stand-in CONNECTED rows: on a throwaway database only. */
export function writesStandIns(env: NodeJS.ProcessEnv = process.env): boolean {
    return isThrowawayDatabase(env.DATABASE_URL);
}

type ProviderDb = Pick<Db, "merchantPaymentProvider" | "communicationProvider">;

/**
 * A payment connection that reads CONNECTED, on a throwaway database; on a
 * shared one, nothing, and a stand-in left by an earlier seed removed.
 * True when the stand-in was written.
 */
export async function seedStandInPaymentProvider(
    prisma: ProviderDb,
    row: { id: string; organizationId: string; provider: string },
    env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
    if (!writesStandIns(env)) {
        await prisma.merchantPaymentProvider.deleteMany({
            where: {
                organizationId: row.organizationId,
                provider: row.provider,
                status: "CONNECTED",
                encryptedCredentials:
                    PLACEHOLDER_CREDENTIALS.encryptedCredentials,
            },
        });
        return false;
    }
    await prisma.merchantPaymentProvider.upsert({
        where: {
            organizationId_provider: {
                organizationId: row.organizationId,
                provider: row.provider,
            },
        },
        update: { status: "CONNECTED" },
        create: { ...row, status: "CONNECTED", ...PLACEHOLDER_CREDENTIALS },
    });
    return true;
}

/**
 * An email (or other channel) connection that reads CONNECTED, on a
 * throwaway database; on a shared one, nothing, and a stand-in left by an
 * earlier seed removed. True when the stand-in was written.
 */
export async function seedStandInCommunicationProvider(
    prisma: ProviderDb,
    row: {
        id: string;
        organizationId: string;
        channel: string;
        provider: string;
        fromAddress: string;
    },
    env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
    if (!writesStandIns(env)) {
        await prisma.communicationProvider.deleteMany({
            where: {
                organizationId: row.organizationId,
                channel: row.channel,
                status: "CONNECTED",
                encryptedCredentials:
                    PLACEHOLDER_CREDENTIALS.encryptedCredentials,
            },
        });
        return false;
    }
    await prisma.communicationProvider.upsert({
        where: {
            organizationId_channel: {
                organizationId: row.organizationId,
                channel: row.channel,
            },
        },
        update: { status: "CONNECTED", fromAddress: row.fromAddress },
        create: { ...row, status: "CONNECTED", ...PLACEHOLDER_CREDENTIALS },
    });
    return true;
}
