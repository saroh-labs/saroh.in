import { BadRequestException } from "@nestjs/common";

/** The widest range one read answers: a month and a bit, as a calendar shows. */
export const BUSY_READ_MAX_DAYS = 42;

/** The range asked for, as two instants no more than {@link BUSY_READ_MAX_DAYS} apart. */
export function readRange(
    fromRaw: string | undefined,
    toRaw: string | undefined,
): { from: Date; to: Date } {
    const from = new Date(fromRaw ?? "");
    const to = new Date(toRaw ?? "");
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
        throw new BadRequestException("Give from and to as dates.");
    }
    if (to <= from) {
        throw new BadRequestException("to must be after from.");
    }
    if (to.getTime() - from.getTime() > BUSY_READ_MAX_DAYS * 86_400_000) {
        throw new BadRequestException(
            `Ask for at most ${BUSY_READ_MAX_DAYS} days at a time.`,
        );
    }
    return { from, to };
}
