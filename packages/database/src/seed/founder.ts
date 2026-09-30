import { FOUNDER_EMAIL, FOUNDER_PASSWORD } from "./data";
import type { Db } from "./helpers";
import { hashPassword, id } from "./helpers";

/**
 * Asha, who has just signed up (DEC-070, K2): a verified account with no
 * business, so the workspace sends her to setup. Browser specs about setting
 * up sign in as her and make businesses of their own.
 *
 * Only the person is seeded. A business she made in an earlier run is
 * hers, not the seed's, and is left as it is.
 */
export async function seedFounder(prisma: Db): Promise<void> {
    const founder = await prisma.user.upsert({
        where: { email: FOUNDER_EMAIL },
        update: { name: "Asha Rao", emailVerified: true },
        create: {
            id: id("user", "founder"),
            email: FOUNDER_EMAIL,
            name: "Asha Rao",
            emailVerified: true,
        },
    });
    // better-auth's own hasher, as for the owner and the reviewer.
    await prisma.account.upsert({
        where: { id: id("account", "founder") },
        update: { password: await hashPassword(FOUNDER_PASSWORD) },
        create: {
            id: id("account", "founder"),
            accountId: founder.id,
            providerId: "credential",
            userId: founder.id,
            password: await hashPassword(FOUNDER_PASSWORD),
        },
    });
}
