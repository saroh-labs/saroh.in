import { BadRequestException } from "@nestjs/common";
import type { Service } from "@saroh/database";

import type { DepositMode } from "./dto";
import { DEPOSIT_MODES } from "./dto";

/*
 * The round-2 service fields (E1): visits, the deposit and "Show on booking
 * page". Columns land before behaviour — nothing takes a deposit until E8 or
 * books more than one visit until E9/E10 — so these only store, check and
 * serve them to staff.
 */

/** Each deposit's share of the price, in percent. */
const DEPOSIT_PERCENT: Record<DepositMode, number> = {
    NONE: 0,
    PERCENT_25: 25,
    PERCENT_50: 50,
    FULL: 100,
};

function isDepositMode(value: string): value is DepositMode {
    return (DEPOSIT_MODES as readonly string[]).includes(value);
}

/**
 * What is paid at booking, in minor units, worked out from the price —
 * rounded to the paisa, half up — or null when nothing is. The client never
 * sends it. A mode the column should never hold reads as no deposit.
 */
export function depositCents(
    priceCents: number | null,
    depositMode: string,
): number | null {
    if (!isDepositMode(depositMode) || depositMode === "NONE") return null;
    if (priceCents === null || priceCents <= 0) return null;
    return Math.round((priceCents * DEPOSIT_PERCENT[depositMode]) / 100);
}

/**
 * A deposit is a share of a price, so only a priced service has one. Checked
 * on the service as it will be after the write, so clearing the price of a
 * service that takes a deposit is refused too.
 */
export function assertDepositPriced(
    priceCents: number | null,
    depositMode: string,
): void {
    if (depositMode === "NONE") return;
    if (priceCents !== null && priceCents > 0) return;
    throw new BadRequestException({
        message:
            "A deposit is part of the price. Set a price first, or take nothing at booking.",
        details: { field: "depositMode" },
    });
}

/** A service as staff read it: the row, plus the deposit it takes. */
export type ServiceView = Service & { depositCents: number | null };

export function toServiceView(service: Service): ServiceView {
    return {
        ...service,
        depositCents: depositCents(service.priceCents, service.depositMode),
    };
}
