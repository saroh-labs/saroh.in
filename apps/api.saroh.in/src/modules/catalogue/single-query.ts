import { BadRequestException } from "@nestjs/common";

/**
 * A query value given once. `?pattern=a&pattern=b` arrives as an array.
 * Typed `string`, the global ValidationPipe (`transform: true`) would turn
 * it into "a,b" — no 500, but two values silently read as one. Typed
 * `unknown`, the array reaches here and is refused in words; that is also
 * what satisfies CodeQL's type-confusion rule (js/type-confusion-through-
 * parameter-tampering), which cannot see the pipe. `what` names the value
 * as the message says it.
 *
 * Shared by the business's catalogue routes and the old per-storefront
 * aliases (#529), so every SKU-pattern read refuses a repeat the same way.
 */
export function single(what: string, value: unknown): string | undefined {
    if (value === undefined || typeof value === "string") return value;
    throw new BadRequestException(`Send one ${what} at a time.`);
}
