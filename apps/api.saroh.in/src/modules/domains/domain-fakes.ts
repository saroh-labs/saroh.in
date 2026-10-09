import type { RunMarks } from "../../common/test-run";
import { isTestRun } from "../../common/test-run";
import { declaredNodeEnv, env } from "../../env";

/**
 * The test-only switch that runs custom domains on fakes (#861's browser
 * tests): `DOMAIN_HOSTING_FAKE=1` binds the {@link ExampleDomainVerifier}
 * under `DOMAIN_VERIFIER` and a labelled `FakeDomainHosting` under
 * `DOMAIN_HOSTING`, so the browser-test stack can verify a domain and see
 * each hosting state without DNS or Cloudflare.
 *
 * Two locks, as `LINK_PREVIEW_TEST_HOSTS` has: the API refuses to boot with
 * it under NODE_ENV=production (`env.ts`), and it is honoured only in a
 * test run (`common/test-run.ts`) — the browser-test stack sets `CI` and
 * runs with `SKIP_ENV_VALIDATION`, which skips the first lock.
 */
export function domainFakesAllowed(
    value: string | undefined,
    run: RunMarks,
): boolean {
    return value === "1" && isTestRun(run);
}

/** Whether this process runs custom domains on the fakes. */
export function domainFakesOn(): boolean {
    return domainFakesAllowed(env.DOMAIN_HOSTING_FAKE, {
        nodeEnvs: [declaredNodeEnv, env.NODE_ENV],
        ci: env.CI,
    });
}
