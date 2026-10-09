/**
 * Whether this process says it is a test run, for the API's test-only
 * switches (`LINK_PREVIEW_TEST_HOSTS`, `DOMAIN_HOSTING_FAKE`).
 *
 * A test run is `NODE_ENV` declared `test` (Jest), or `CI` set (the
 * browser-test stack, in CI and in `scripts/prepush.sh`, runs the built API
 * with no `NODE_ENV`). Never under a declared `production`, whatever else is
 * set, and the environment refuses to boot with a test-only switch there
 * anyway (`env.ts`). So a staging host that copied a switch, with
 * `NODE_ENV=development` or none, does not get it.
 *
 * `nodeEnvs` is `[declaredNodeEnv, env.NODE_ENV]`: the first is what the
 * process was actually given, the second the schema's value (which defaults
 * to `development`).
 */
export interface RunMarks {
    nodeEnvs: (string | undefined)[];
    ci?: string;
}

export function isTestRun(run: RunMarks): boolean {
    if (run.nodeEnvs.includes("production")) return false;
    const ci = (run.ci ?? "").trim().toLowerCase();
    return (
        run.nodeEnvs[0] === "test" ||
        (ci !== "" && ci !== "false" && ci !== "0")
    );
}
