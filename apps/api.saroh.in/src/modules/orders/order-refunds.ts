import { BadRequestException } from "@nestjs/common";

/**
 * Refund by line (ADR-008, U6) — the money arithmetic, pure.
 *
 * What a line "paid" is its price × quantity less its share of the order's
 * discount, spread across lines in proportion (largest remainder, so the
 * shares sum to the discount to the paisa). Tax and shipping belong to no
 * line; a line refund never reaches them, a full refund does.
 *
 * A refund of q of a line's Q units takes the cumulative share: after it,
 * round(paid × (refunded + q) / Q) has gone back in total. So refunding a
 * line one unit at a time returns exactly what refunding it at once would,
 * and the last unit takes whatever rounding left.
 *
 * All amounts are integer minor units. Nothing here reads a request: the
 * caller loads the lines and what was already refunded of them (under the
 * order's row lock), and passes the lines a client ASKED for — never an
 * amount.
 */

export interface RefundableLine {
    id: string;
    quantity: number;
    /** Unit price in minor units, as snapshotted on the order. */
    unitCents: number;
    /** Units already refunded (pending or settled, never failed). */
    refundedQuantity: number;
    /** Minor units already refunded of this line. */
    refundedCents: number;
}

export interface LineRefundRequest {
    itemId: string;
    quantity: number;
}

export interface PlannedLineRefund {
    itemId: string;
    quantity: number;
    amountCents: number;
}

/**
 * Each line's paid amount: gross less its proportional share of
 * `discountCents`. Never negative; a discount larger than the lines (it
 * cannot be, but) leaves every line at zero.
 */
export function linePaidCents(
    lines: readonly { id: string; quantity: number; unitCents: number }[],
    discountCents: number,
): Map<string, number> {
    const gross = lines.map((l) => ({
        id: l.id,
        gross: l.unitCents * l.quantity,
    }));
    const total = gross.reduce((s, l) => s + l.gross, 0);
    const discount = Math.max(0, Math.min(discountCents, total));
    const paid = new Map<string, number>();
    if (total === 0 || discount === 0) {
        for (const l of gross) paid.set(l.id, l.gross);
        return paid;
    }
    // Largest remainder: floor every share, then hand the leftover paise to
    // the lines with the biggest fractional parts (ties by input order).
    const shares = gross.map((l, i) => {
        const exact = (discount * l.gross) / total;
        return {
            i,
            id: l.id,
            gross: l.gross,
            floor: Math.floor(exact),
            frac: exact - Math.floor(exact),
        };
    });
    let left = discount - shares.reduce((s, x) => s + x.floor, 0);
    const byFrac = [...shares].sort((a, b) => b.frac - a.frac || a.i - b.i);
    for (const s of byFrac) {
        if (left <= 0) break;
        s.floor += 1;
        left -= 1;
    }
    for (const s of shares) paid.set(s.id, Math.max(0, s.gross - s.floor));
    return paid;
}

/**
 * Plan a refund of the requested lines. Refuses an unknown line, a line named
 * twice, and a quantity beyond what is left of the line (the cap). Returns
 * one entry per requested line with its server-computed amount.
 */
export function planLineRefund(
    lines: readonly RefundableLine[],
    discountCents: number,
    requests: readonly LineRefundRequest[],
): PlannedLineRefund[] {
    if (requests.length === 0) {
        throw new BadRequestException({
            message: "Choose at least one line to refund.",
            field: "lines",
        });
    }
    const paid = linePaidCents(lines, discountCents);
    const byId = new Map(lines.map((l) => [l.id, l]));
    const seen = new Set<string>();
    return requests.map((r) => {
        const line = byId.get(r.itemId);
        if (!line) {
            throw new BadRequestException({
                message: "That line is not on this order.",
                field: "lines",
            });
        }
        if (seen.has(r.itemId)) {
            throw new BadRequestException({
                message: "Name each line once.",
                field: "lines",
            });
        }
        seen.add(r.itemId);
        const left = line.quantity - line.refundedQuantity;
        if (!Number.isInteger(r.quantity) || r.quantity < 1) {
            throw new BadRequestException({
                message: "Refund at least one of a line.",
                field: "lines",
            });
        }
        if (r.quantity > left) {
            throw new BadRequestException({
                message:
                    left === 0
                        ? "That line has already been refunded."
                        : `Only ${left} of that line ${left === 1 ? "is" : "are"} left to refund.`,
                field: "lines",
            });
        }
        const linePaid = paid.get(line.id) ?? 0;
        const after = line.refundedQuantity + r.quantity;
        const cumulative =
            after === line.quantity
                ? linePaid
                : Math.round((linePaid * after) / line.quantity);
        const amountCents = Math.max(
            0,
            Math.min(
                cumulative - line.refundedCents,
                linePaid - line.refundedCents,
            ),
        );
        return { itemId: line.id, quantity: r.quantity, amountCents };
    });
}

/**
 * Everything still refundable of every line — what a full refund records
 * against the lines, so a later line refund finds nothing left.
 */
export function planRemainingLines(
    lines: readonly RefundableLine[],
    discountCents: number,
): PlannedLineRefund[] {
    const open = lines.filter((l) => l.quantity > l.refundedQuantity);
    if (open.length === 0) return [];
    return planLineRefund(
        lines,
        discountCents,
        open.map((l) => ({
            itemId: l.id,
            quantity: l.quantity - l.refundedQuantity,
        })),
    );
}

/**
 * Split an amount across the payments it can come back from, newest first.
 * Each entry is how much to refund against that payment. Throws when the
 * payments together cannot cover it — the order-level cap.
 */
export function allocateAcrossPayments<
    T extends { id: string; leftCents: number },
>(
    payments: readonly T[],
    amountCents: number,
): { payment: T; amountCents: number }[] {
    const available = payments.reduce(
        (s, p) => s + Math.max(0, p.leftCents),
        0,
    );
    if (amountCents > available) {
        throw new BadRequestException({
            message: "That is more than is left to refund on this order.",
            field: "lines",
        });
    }
    const out: { payment: T; amountCents: number }[] = [];
    let left = amountCents;
    for (const p of [...payments].reverse()) {
        if (left <= 0) break;
        const take = Math.min(left, Math.max(0, p.leftCents));
        if (take > 0) {
            out.push({ payment: p, amountCents: take });
            left -= take;
        }
    }
    return out;
}

/**
 * How the money on an order stands, from its payments and refunds — derived,
 * never stored. `PARTLY_REFUNDED` is the reading ADR-008 adds: some money
 * went back, not all of it, and the order's stored paymentStatus stays PAID.
 */
export function refundStanding(
    paymentStatus: string,
    capturedCents: number,
    refundedCents: number,
): "NONE" | "PARTLY_REFUNDED" | "REFUNDED" {
    if (paymentStatus === "REFUNDED") return "REFUNDED";
    if (refundedCents <= 0) return "NONE";
    return refundedCents >= capturedCents && capturedCents > 0
        ? "REFUNDED"
        : "PARTLY_REFUNDED";
}
