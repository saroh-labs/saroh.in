import { Injectable, Logger } from "@nestjs/common";
import type { MessagingLedgerEntry } from "@saroh/database";
import { prisma, runInOrgContext } from "@saroh/database";

import { prismaErrorCode } from "../../common/prisma-errors";

/** A WhatsApp hold with no delivery report after this long is given back. */
export const STALE_HOLD_MS = 24 * 60 * 60 * 1000;

/** A top-up's money lasts this long from the latest top-up. */
const EXPIRY_MONTHS = 12;

const DEFAULT_LEDGER_PAGE = 50;

export type HoldResult =
    { ok: true } | { ok: false; reason: "INSUFFICIENT_BALANCE" };

export interface WalletView {
    balancePaise: number;
    heldPaise: number;
    availablePaise: number;
    expiresAt: Date | null;
}

export interface LedgerPage {
    entries: MessagingLedgerEntry[];
    /** Pass as `cursor` for the next page; null on the last. */
    nextCursor: string | null;
}

/**
 * A business's prepaid messaging balance, in paise (DEC-191, #1240).
 * Available = balance - held. A send holds its price first (`hold`), then is
 * charged (`debit`, a WhatsApp on delivery) or given back (`release`); each
 * send settles once, guarded on its `chargedAt`/`releasedAt` with the
 * ledger's unique (sendId, kind) behind it. Sending stops at zero: a hold
 * is a conditional UPDATE, so concurrent holds never overspend.
 */
@Injectable()
export class WalletService {
    private readonly logger = new Logger(WalletService.name);

    /** Hold `pricePaise` of the available balance; refused when it isn't there. */
    hold(organizationId: string, pricePaise: number): Promise<HoldResult> {
        return runInOrgContext(organizationId, async () => {
            // Conditional, so the row sells only what it has (as stock's
            // `reserve`); expired money is not spendable before the sweep.
            const moved = await prisma.$executeRaw`
                UPDATE "MessagingWallet"
                SET "heldPaise" = "heldPaise" + ${pricePaise},
                    "updatedAt" = (now() AT TIME ZONE 'UTC')
                WHERE "organizationId" = ${organizationId}
                  AND "balancePaise" - "heldPaise" >= ${pricePaise}
                  AND ("expiresAt" IS NULL OR "expiresAt" > (now() AT TIME ZONE 'UTC'))`;
            return moved === 1
                ? { ok: true as const }
                : {
                      ok: false as const,
                      reason: "INSUFFICIENT_BALANCE" as const,
                  };
        });
    }

    /** Charge a held send its price. False when it was already settled. */
    debit(sendId: string): Promise<boolean> {
        return this.settle(sendId, "DEBIT");
    }

    /** Give a held send's price back, charging nothing. False when already settled. */
    release(sendId: string): Promise<boolean> {
        return this.settle(sendId, "RELEASE");
    }

    private async settle(
        sendId: string,
        kind: "DEBIT" | "RELEASE",
    ): Promise<boolean> {
        const send = await prisma.messagingSend.findUnique({
            where: { id: sendId },
            select: { organizationId: true, pricePaise: true },
        });
        if (!send) return false;
        const { organizationId, pricePaise } = send;
        const charge = kind === "DEBIT";
        try {
            return await runInOrgContext(organizationId, () =>
                prisma.$transaction(async (tx) => {
                    const now = new Date();
                    // Guarded on the state, so a replayed report or a late
                    // delivery after a release settles nothing.
                    const claimed = await tx.messagingSend.updateMany({
                        where: {
                            id: sendId,
                            chargedAt: null,
                            releasedAt: null,
                        },
                        data: charge ? { chargedAt: now } : { releasedAt: now },
                    });
                    if (claimed.count !== 1) return false;
                    const wallet = await tx.messagingWallet.update({
                        where: { organizationId },
                        data: {
                            heldPaise: { decrement: pricePaise },
                            ...(charge
                                ? { balancePaise: { decrement: pricePaise } }
                                : {}),
                        },
                        select: { balancePaise: true },
                    });
                    await tx.messagingLedgerEntry.create({
                        data: {
                            organizationId,
                            kind,
                            amountPaise: charge ? -pricePaise : 0,
                            balanceAfter: wallet.balancePaise,
                            sendId,
                        },
                    });
                    return true;
                }),
            );
        } catch (error) {
            // The ledger's unique (sendId, kind): settled already.
            if (prismaErrorCode(error) === "P2002") return false;
            throw error;
        }
    }

    /** Add a top-up; its money lasts 12 months from now, as all the balance does. */
    credit(
        organizationId: string,
        amountPaise: number,
        { topupId, reason }: { topupId?: string; reason?: string } = {},
    ): Promise<WalletView> {
        return runInOrgContext(organizationId, () =>
            prisma.$transaction(async (tx) => {
                const expiresAt = new Date();
                expiresAt.setUTCMonth(expiresAt.getUTCMonth() + EXPIRY_MONTHS);
                const wallet = await tx.messagingWallet.upsert({
                    where: { organizationId },
                    create: {
                        organizationId,
                        balancePaise: amountPaise,
                        expiresAt,
                    },
                    update: {
                        balancePaise: { increment: amountPaise },
                        expiresAt,
                    },
                });
                await tx.messagingLedgerEntry.create({
                    data: {
                        organizationId,
                        kind: "TOPUP",
                        amountPaise,
                        balanceAfter: wallet.balancePaise,
                        topupId,
                        reason,
                    },
                });
                return view(wallet);
            }),
        );
    }

    /** The balance; a business with no wallet yet has nothing. */
    async get(organizationId: string): Promise<WalletView> {
        const wallet = await runInOrgContext(organizationId, () =>
            prisma.messagingWallet.findUnique({ where: { organizationId } }),
        );
        return view(
            wallet ?? { balancePaise: 0, heldPaise: 0, expiresAt: null },
        );
    }

    /** The money trail, newest first, `limit` entries after `cursor`. */
    async ledger(
        organizationId: string,
        {
            cursor,
            limit = DEFAULT_LEDGER_PAGE,
        }: { cursor?: string; limit?: number } = {},
    ): Promise<LedgerPage> {
        const page = await runInOrgContext(organizationId, () =>
            prisma.messagingLedgerEntry.findMany({
                where: { organizationId },
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                take: limit + 1,
                ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            }),
        );
        const more = page.length > limit;
        const entries = more ? page.slice(0, limit) : page;
        return {
            entries,
            nextCursor: more ? entries[entries.length - 1].id : null,
        };
    }

    /**
     * Across every business: give back WhatsApp holds with no report after
     * 24 hours, then expire the free balance of wallets past `expiresAt`
     * (money held for sends still in flight stays until they settle; a later
     * release leaves free money the next run expires). A failing item is
     * logged and the rest go on.
     */
    async expireSweep(
        now: Date,
    ): Promise<{ released: number; expired: number }> {
        let released = 0;
        const stale = await prisma.messagingSend.findMany({
            where: {
                channel: "WHATSAPP",
                chargedAt: null,
                releasedAt: null,
                createdAt: { lt: new Date(now.getTime() - STALE_HOLD_MS) },
            },
            select: { id: true },
        });
        for (const { id } of stale) {
            try {
                if (await this.release(id)) released += 1;
            } catch (error) {
                this.logger.error(
                    `wallet_sweep could not release send=${id}: ${errorName(error)}`,
                );
            }
        }

        let expired = 0;
        const wallets = await prisma.messagingWallet.findMany({
            where: { expiresAt: { lte: now }, balancePaise: { gt: 0 } },
            select: { organizationId: true },
        });
        for (const { organizationId } of wallets) {
            try {
                if (await this.expire(organizationId, now)) expired += 1;
            } catch (error) {
                this.logger.error(
                    `wallet_sweep could not expire organization=${organizationId}: ${errorName(error)}`,
                );
            }
        }
        return { released, expired };
    }

    private expire(organizationId: string, now: Date): Promise<boolean> {
        return runInOrgContext(organizationId, () =>
            prisma.$transaction(async (tx) => {
                const w = await tx.messagingWallet.findUnique({
                    where: { organizationId },
                });
                if (!w?.expiresAt || w.expiresAt > now) return false;
                const free = w.balancePaise - w.heldPaise;
                if (free <= 0) return false;
                // Guarded on what was read: a hold or top-up in between wins.
                const moved = await tx.messagingWallet.updateMany({
                    where: {
                        organizationId,
                        balancePaise: w.balancePaise,
                        heldPaise: w.heldPaise,
                        expiresAt: w.expiresAt,
                    },
                    data: { balancePaise: w.heldPaise },
                });
                if (moved.count !== 1) return false;
                await tx.messagingLedgerEntry.create({
                    data: {
                        organizationId,
                        kind: "EXPIRE",
                        amountPaise: -free,
                        balanceAfter: w.heldPaise,
                    },
                });
                return true;
            }),
        );
    }
}

function view(w: {
    balancePaise: number;
    heldPaise: number;
    expiresAt: Date | null;
}): WalletView {
    return {
        balancePaise: w.balancePaise,
        heldPaise: w.heldPaise,
        availablePaise: w.balancePaise - w.heldPaise,
        expiresAt: w.expiresAt,
    };
}

function errorName(error: unknown): string {
    return error instanceof Error ? error.name : "unknown error";
}
