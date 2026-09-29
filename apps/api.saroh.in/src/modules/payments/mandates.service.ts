import { Inject, Injectable, Logger } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type {
    MandateCancelReason,
    MandateScope,
    MarkedCancelled,
} from "./mandate-cancel-job";
import {
    cancelMandatesInTx,
    enqueueMandateCancelInTx,
    scopeWhere,
} from "./mandate-cancel-job";
import type { MandateConnection } from "./mandate-connection";
import { openMandateConnection } from "./mandate-connection";
import type { ProviderFactory } from "./providers/provider.port";
import { MandateCallError, PROVIDER_FACTORY } from "./providers/provider.port";

/** What asking the provider settled, for the mandates still to confirm. */
export interface MandateSettleResult {
    /** The provider said they are cancelled. */
    confirmed: number;
    /** No answer yet (a timeout, a 5xx): ask again later. */
    unsure: number;
    /**
     * The provider refused, or Saroh can't ask it (the connection is gone,
     * or its adapter has no mandates). Asking again won't help; the row
     * stays CANCELLED, unconfirmed, and is logged as an error.
     */
    refused: number;
}

export interface MandateCancelResult extends MarkedCancelled {
    /**
     * Mandates in scope the provider hasn't confirmed as cancelled. Zero:
     * nothing in scope can be charged at the provider any more. A privacy
     * removal (C11) refuses to go ahead while this isn't zero.
     */
    unconfirmed: number;
}

interface Row {
    id: string;
    provider: string;
    providerMandateId: string | null;
    providerCustomerId: string | null;
}

/**
 * Autopay mandates at the business's own provider (DEC-038). D20 owns how
 * a mandate ends. D11's set-up is `mandate-setup.service.ts`, and its
 * two-step charge `mandate-charges.service.ts` (D13 calls it).
 *
 * A mandate is cancelled in two steps. It is marked CANCELLED in Saroh
 * first (`mandate-cancel-job.ts`), so nothing charges it again; then the
 * provider is asked, and `cancelConfirmedAt` records its yes. An unsure
 * answer leaves it CANCELLED and unconfirmed — "being confirmed" — and is
 * asked again (DEC-026). A confirmed mandate is never asked again, so a
 * job delivered twice asks the provider once.
 */
@Injectable()
export class MandatesService {
    private readonly logger = new Logger(MandatesService.name);

    constructor(
        @Inject(PROVIDER_FACTORY) private readonly providers: ProviderFactory,
    ) {}

    /**
     * Cancel every mandate in scope now and wait for the provider's answer:
     * the synchronous path, for a privacy removal (C11), which calls it
     * before its own transaction and refuses the removal while
     * `unconfirmed` isn't zero. Safe to call again: a confirmed mandate is
     * skipped, and one still unconfirmed is asked again. When the provider
     * doesn't confirm them all, a `mandate.cancel` job keeps asking.
     *
     * The subscription paths and a merge don't call this: they hold a
     * transaction, and use `cancelMandatesInTx` with its job instead.
     */
    async cancelFor(
        scope: MandateScope,
        reason: MandateCancelReason,
    ): Promise<MandateCancelResult> {
        const marked = await prisma.$transaction((tx) =>
            cancelMandatesInTx(tx, scope, reason, { queue: false }),
        );
        const settled = await this.settle(scope);
        const unconfirmed = settled.unsure + settled.refused;
        if (settled.unsure > 0) {
            await prisma.$transaction((tx) =>
                enqueueMandateCancelInTx(tx, scope),
            );
        }
        return { ...marked, unconfirmed };
    }

    /**
     * Ask the provider to cancel each CANCELLED mandate in scope it hasn't
     * confirmed yet, and record each yes. The `mandate.cancel` job's work.
     */
    async settle(scope: MandateScope): Promise<MandateSettleResult> {
        const rows: Row[] = await prisma.paymentMandate.findMany({
            where: {
                ...scopeWhere(scope),
                status: "CANCELLED",
                cancelConfirmedAt: null,
            },
            select: {
                id: true,
                provider: true,
                providerMandateId: true,
                providerCustomerId: true,
            },
            orderBy: { id: "asc" },
        });
        const result: MandateSettleResult = {
            confirmed: 0,
            unsure: 0,
            refused: 0,
        };
        const connections = new Map<string, Connection | null>();
        for (const row of rows) {
            const outcome = await this.askProvider(
                scope.organizationId,
                row,
                connections,
            );
            if (outcome === "CONFIRMED") {
                await prisma.paymentMandate.updateMany({
                    where: { id: row.id, cancelConfirmedAt: null },
                    data: { cancelConfirmedAt: new Date() },
                });
                result.confirmed += 1;
            } else if (outcome === "UNKNOWN") {
                result.unsure += 1;
            } else {
                result.refused += 1;
            }
        }
        return result;
    }

    private async askProvider(
        organizationId: string,
        row: Row,
        connections: Map<string, Connection | null>,
    ): Promise<"CONFIRMED" | "UNKNOWN" | "REFUSED"> {
        // Set up in Saroh but never at the provider: nothing to cancel there.
        if (!row.providerMandateId) return "CONFIRMED";
        if (!connections.has(row.provider)) {
            connections.set(
                row.provider,
                await this.connection(organizationId, row.provider),
            );
        }
        const connection = connections.get(row.provider);
        if (!connection) {
            this.logger.error(
                `Mandate ${row.id}: can't ask ${row.provider} to cancel it (no connection, or no mandate support); it stays cancelled in Saroh, unconfirmed`,
            );
            return "REFUSED";
        }
        try {
            await connection.mandates.cancel({
                providerMandateId: row.providerMandateId,
                providerCustomerId: row.providerCustomerId,
                credentials: connection.credentials,
            });
            return "CONFIRMED";
        } catch (err) {
            // An error that isn't the port's own is a call that may have
            // gone through: ask again, never assume (DEC-026).
            // A cancel is never "not yet": any answer but a refusal is asked again.
            const outcome =
                err instanceof MandateCallError && err.outcome === "REFUSED"
                    ? "REFUSED"
                    : "UNKNOWN";
            if (outcome === "REFUSED") {
                this.logger.error(
                    `Mandate ${row.id}: ${row.provider} refused to cancel it; it stays cancelled in Saroh, unconfirmed`,
                );
            } else {
                this.logger.warn(
                    `Mandate ${row.id}: no answer from ${row.provider} to the cancel yet`,
                );
            }
            return outcome;
        }
    }

    /**
     * The business's connection to `provider`, opened for one round of
     * calls. A disconnected (DISABLED) one still cancels: the mandate is
     * still live at the provider. Null when there's no connection, or its
     * adapter has no mandates.
     */
    private connection(
        organizationId: string,
        provider: string,
    ): Promise<Connection | null> {
        return openMandateConnection(this.providers, organizationId, provider, {
            connectedOnly: false,
        });
    }
}

type Connection = MandateConnection;
