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
    },
});
