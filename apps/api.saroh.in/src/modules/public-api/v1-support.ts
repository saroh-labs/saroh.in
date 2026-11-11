import {
    applyDecorators,
    BadRequestException,
    Delete,
    Get,
    Header,
    HttpCode,
    NotFoundException,
    Patch,
    Post,
    Put,
    SetMetadata,
} from "@nestjs/common";
import type { Money, RouteDef } from "@saroh/api-contract";
import { decodeCursor, encodeCursor } from "@saroh/api-contract";

import type { IdempotencyService } from "../../common/idempotency/idempotency.service";
import type { OrganizationContext } from "../../common/types/organization-context";
import type { KeyedRequest } from "../api-keys/api-key.guard";

/**
 * What every `/v1` and `/v1/storefront` handler shares (plan 2026-11-10-001,
 * U8): its contract route, its paging, its idempotency and money in minor
 * units.
 */

/** The metadata key `route-capabilities.spec.ts` reads off every handler. */
export const CONTRACT_ROUTE = "saroh:contract-route";

const VERBS = { get: Get, post: Post, put: Put, patch: Patch, delete: Delete };

/**
 * Mounts a handler at its contract route: the method and path come from the
 * contract, so the OpenAPI document and the controller can't disagree, and
 * the route's declared capability is on the handler for the scan. Answers
 * are never cached: they are one business's records.
 */
export function ContractRoute(def: RouteDef) {
    return applyDecorators(
        VERBS[def.method](def.path.replace(/^\//, "")),
        SetMetadata(CONTRACT_ROUTE, def),
        HttpCode(def.responses[201] ? 201 : 200),
        Header("Cache-Control", "no-store"),
    );
}

/** A refusal in the public contract's shape (`AllExceptionsFilter` adds `requestId`). */
export const notFound = (what: string) =>
    new NotFoundException({
        error: { code: "not_found", message: `No such ${what}.` },
    });

export const invalid = (message: string) =>
    new BadRequestException({ error: { code: "invalid_request", message } });

/** Newest first, with the id breaking ties, so a cursor never moves. */
export const NEWEST_FIRST = [
    { createdAt: "desc" as const },
    { id: "desc" as const },
];

/**
 * Rows after a cursor in {@link NEWEST_FIRST} order. Keyset, not offset: a
 * row added while someone pages lands before their first page, so the pages
 * after it neither repeat nor skip a row.
 */
export function afterCursor(cursor: string | undefined) {
    if (!cursor) return {};
    const [at, id] = decodeCursor(cursor).split("|");
    const when = new Date(at);
    if (!id || Number.isNaN(when.getTime())) {
        throw invalid("query.cursor: Not a valid cursor");
    }
    return {
        OR: [{ createdAt: { lt: when } }, { createdAt: when, id: { lt: id } }],
    };
}

/** One page of `limit` rows, read with `take: limit + 1`. */
export function pageOf<R extends { id: string; createdAt: Date }, V>(
    rows: R[],
    limit: number,
    view: (row: R) => V,
): { data: V[]; nextCursor: string | null } {
    const kept = rows.slice(0, limit);
    const more = rows.length > limit;
    return {
        data: kept.map(view),
        // `limit` is at least 1, so a longer read always kept a last row.
        nextCursor: more ? cursorAt(kept[kept.length - 1]) : null,
    };
}

const cursorAt = (row: { id: string; createdAt: Date }) =>
    encodeCursor(`${row.createdAt.toISOString()}|${row.id}`);

/** Prisma's Decimal (2 places), or a decimal string, as minor units. */
export function toMoney(
    amount: { toString(): string } | null,
    currency: string,
): Money {
    return {
        amountMinor: Math.round(Number(String(amount ?? 0)) * 100),
        currency,
    };
}

/** Minor units as the decimal text the workspace DTOs take ("45.00"). */
export function toDecimal(amountMinor: number): string {
    return (amountMinor / 100).toFixed(2);
}

export const iso = (d: Date | null): string | null =>
    d ? d.toISOString() : null;

const IDEMPOTENCY_KEY = /^[\x21-\x7e]{1,255}$/;

/**
 * Runs a POST or PATCH at most once per `Idempotency-Key`: the same key with
 * the same request answers the first answer again; with a different request,
 * 409. Keys are per API key and per route, so two integrations never share
 * one. No header, no idempotency.
 */
export function once<T>(
    idempotency: IdempotencyService,
    req: KeyedRequest,
    ctx: OrganizationContext,
    request: unknown,
    operation: () => Promise<T>,
): Promise<T> {
    const raw = req.headers["idempotency-key"];
    const key = typeof raw === "string" ? raw : undefined;
    if (
        raw !== undefined &&
        (key === undefined || !IDEMPOTENCY_KEY.test(key))
    ) {
        throw invalid(
            "Idempotency-Key: 1 to 255 visible characters, sent once",
        );
    }
    const route =
        (req.route as { path?: string } | undefined)?.path ?? req.path;
    return idempotency.run(
        {
            scope: `v1:${req.method} ${route}:${req.apiKey?.id ?? "-"}`,
            key,
            actorUserId: ctx.userId,
            organizationId: ctx.organizationId,
        },
        request,
        operation,
    );
}
