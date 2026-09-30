import { SetMetadata } from "@nestjs/common";

export const ALLOW_ON_TEST_RELEASE = "site:allow-on-test-release";

/**
 * Let a public, state-changing-looking route answer a test host (DEC-071,
 * KTD-8). `TestHostWriteGuard` refuses every non-GET `/public/*` call from a
 * test release by default; this is how a route says it writes nothing, so a
 * tester can still reach it.
 *
 * Only for read-shaped POSTs, such as the checkout quote: a POST because the
 * bag is a body, but nothing is stored. A route that stores anything, sends
 * anything or charges anything must never carry it.
 * `common/guards/test-host-routes.spec.ts` pins which routes do.
 */
export const AllowOnTestRelease = () =>
    SetMetadata(ALLOW_ON_TEST_RELEASE, true);
