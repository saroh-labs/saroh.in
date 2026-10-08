/**
 * A read the site makes while it is being built, tried again when it fails.
 *
 * The marketing site reads pricing and the launch offer from the API while it
 * is built (it is static). A deploy often coincides with the API's own deploy
 * of the same commit, and a read during that restart times out: the build
 * then fails, by design, rather than publish a placeholder. Trying again for
 * about a minute rides out the restart.
 */
export const BUILD_RETRY_DELAYS_MS = [3_000, 8_000, 15_000, 30_000];

export async function withBuildRetries<T>(
    read: () => Promise<T>,
    delaysMs: readonly number[] = BUILD_RETRY_DELAYS_MS,
    sleep: (ms: number) => Promise<void> = (ms) =>
        new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<T> {
    for (let attempt = 0; ; attempt++) {
        try {
            return await read();
        } catch (err) {
            if (attempt >= delaysMs.length) throw err;
            const delay = delaysMs[attempt];
            console.warn(
                `[build] read failed (${err instanceof Error ? err.message : String(err)}); trying again in ${delay / 1000}s`,
            );
            await sleep(delay);
        }
    }
}
