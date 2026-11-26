import type { ArgumentMetadata, PipeTransform } from "@nestjs/common";
import { BadRequestException } from "@nestjs/common";

/** How deeply a request body may nest objects and arrays. */
export const MAX_BODY_DEPTH = 64;

/**
 * Whether `value` nests deeper than `max`. Walked with a list, not by
 * recursion, so the check itself never runs out of stack.
 */
export function nestsDeeperThan(value: unknown, max: number): boolean {
    const pending: [unknown, number][] = [[value, 0]];
    for (let next = pending.pop(); next; next = pending.pop()) {
        const [node, depth] = next;
        if (node === null || typeof node !== "object") continue;
        if (depth >= max) return true;
        for (const child of Object.values(node)) {
            pending.push([child, depth + 1]);
        }
    }
    return false;
}

/**
 * Refuses a body nested beyond {@link MAX_BODY_DEPTH} with a 400, before
 * validation builds DTOs from it. Global (main.ts), first of the pipes, so
 * it covers every route that reads a body, public ones included.
 */
export class BodyDepthPipe implements PipeTransform {
    transform(value: unknown, metadata: ArgumentMetadata): unknown {
        if (
            metadata.type === "body" &&
            nestsDeeperThan(value, MAX_BODY_DEPTH)
        ) {
            throw new BadRequestException(
                "The request body is nested too deeply.",
            );
        }
        return value;
    }
}
