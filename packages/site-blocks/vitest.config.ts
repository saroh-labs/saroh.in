import { defineConfig } from "vitest/config";

/**
 * Component tests for @saroh/site-blocks.
 *
 * These exist for gate G5 (#252): the six renderers moved out of
 * `apps/saroh.app` and their output must not change, because that path serves
 * every published merchant site. The snapshots here pin each block's markup
 * against its own fixture, so a later edit that alters what a merchant's page
 * looks like has to say so out loud.
 *
 * What they cannot cover is the four scenes — dark, bright ambient light, 320px
 * and one-handed reach need a real browser against a running stack.
 */
export default defineConfig({
    test: {
        environment: "jsdom",
        globals: true,
        setupFiles: ["./vitest.setup.ts"],
        /*
         * The booking block prints the VISITOR's resolved timezone ("Times
         * shown in Asia/Kolkata"), so its snapshot recorded whichever zone the
         * machine that wrote it was in. That went unnoticed for as long as the
         * suite only ever ran on one developer's laptop; the first CI run
         * (#287) failed on it, because a runner is UTC.
         *
         * Pinning a zone here makes the snapshot say the same thing everywhere.
         * A real one, not UTC: UTC would still pass if someone replaced the
         * resolved zone with a hardcoded string.
         */
        env: { TZ: "America/New_York" },
    },
});
