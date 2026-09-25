import type { INestApplication } from "@nestjs/common";

/**
 * Read the client's address `hops` proxies back (#508), on the Express
 * instance under Nest — what `@Ip()` and every rate limiter keyed on it see.
 *
 * With no hops trusted, every request behind Traefik arrives from Traefik,
 * so one busy client fills a limiter for everyone. With too many, the
 * client's own `X-Forwarded-For` entry is believed and it picks its address.
 * `TRUST_PROXY_HOPS` in `src/env.ts` says how many there are.
 *
 * Under SKIP_ENV_VALIDATION the value arrives as the raw string, or unset —
 * and a string would reach Express as a list of addresses. Anything that is
 * not a whole number of hops trusts none, which is right for CI's bare port.
 */
export function trustProxyHops(app: INestApplication, hops: number): void {
    const count = Number(hops);
    const express = app.getHttpAdapter().getInstance() as {
        set(setting: string, value: unknown): unknown;
    };
    express.set(
        "trust proxy",
        Number.isInteger(count) && count >= 0 ? count : 0,
    );
}
