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
import * as matchers from "@testing-library/jest-dom/matchers";
import { expect } from "vitest";

expect.extend(matchers);
