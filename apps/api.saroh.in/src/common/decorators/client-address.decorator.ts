import type { ExecutionContext } from "@nestjs/common";
import { createParamDecorator } from "@nestjs/common";
import type { Request } from "express";

import { env } from "../../env";
import { requestAddress } from "../client-ip";

/**
 * The caller's address for a rate limit or an address hash: Cloudflare's
 * `CF-Connecting-IP` behind Cloudflare, never `X-Forwarded-For`
 * ({@link requestAddress}). Use it instead of Nest's `@Ip()`, which a
 * caller could steer (05-P-01); the API's ESLint config refuses importing
 * `Ip`. `undefined` when the platform gives no address, as `@Ip()`.
 */
export const ClientAddress = createParamDecorator(
    (_data: unknown, ctx: ExecutionContext): string | undefined =>
        requestAddress(
            ctx.switchToHttp().getRequest<Request>(),
            env.TRUST_PROXY,
        ),
);
