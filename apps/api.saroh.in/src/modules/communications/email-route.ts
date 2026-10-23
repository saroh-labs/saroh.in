import type { Prisma } from "@saroh/database";

/**
 * Who emails a business's customers: its own CONNECTED email provider, or
 * nobody. Saroh never sends a business's customer email from its own
 * address (DEC-086 was reversed on 7 Oct 2026 and its code removed, #1134);
 * a scan keeps it that way (`no-saroh-customer-mail.spec.ts`).
 *
 * The one read behind the notify handler, `queueTransactional` and notice
 * reach, so what the workspace says is always what is sent.
 */

type ProviderDb = Pick<Prisma.TransactionClient, "communicationProvider">;

/**
 * The business's own CONNECTED email provider's name ("RESEND", …), or
 * null: none, or one it disconnected.
 */
export async function emailRoute(
    db: ProviderDb,
    organizationId: string,
): Promise<string | null> {
    const row = await db.communicationProvider.findUnique({
        where: {
            organizationId_channel: { organizationId, channel: "EMAIL" },
        },
        select: { status: true, provider: true },
    });
    return row?.status === "CONNECTED" ? row.provider : null;
}
