/// <reference types="@testing-library/jest-dom/vitest" />
/*
 * jest-dom's matchers, added to THIS package's `expect`.
 *
 * Not `import "@testing-library/jest-dom/vitest"`: that entry imports `vitest`
 * from jest-dom's own resolution, and pnpm can resolve it to a different copy
 * of vitest than the runner (same version, different peer set — installing the
 * React Compiler did exactly that). Loading a second vitest replaces the
 * global expect state, and every snapshot in the suite then fails with
 * "snapshot state … not found". Extending the `expect` imported here keeps one
 * vitest in the process whatever the lockfile does.
 */
// The line above is types only — erased at runtime — and gives `expect` the
// matchers' signatures; the extend below is what adds them.
import * as matchers from "@testing-library/jest-dom/matchers";
import { afterEach, beforeEach, expect } from "vitest";

import { viewport } from "./src/test-viewport";

expect.extend(matchers);

// Every test starts at a desk's width: what only a phone shows is hidden,
// as it is for a visitor there. A phone's test asks for `viewport("phone")`.
beforeEach(() => viewport("desk"));

// Each test is its own visit: what one kept for the visit (the bag's draft,
// a sign-in half done) must not be there for the next.
afterEach(() => {
    if (typeof window !== "undefined") window.sessionStorage.clear();
});

// Each test starts at the site's root address: the booking page writes its
// step into the address (U9), and one test's must not open the next's.
afterEach(() => {
    if (typeof window !== "undefined")
        window.history.replaceState(null, "", "/");
});
