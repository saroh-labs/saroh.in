import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
    siteCodeOutboxPath,
    siteCodesFakeAllowed,
    writeSiteCodeOutbox,
} from "./site-code-outbox";

/**
 * The fake code transport's outbox (round-2 plan A, A9): where a local
 * browser test finds the code it was sent, and when the fake may run at all.
 */
describe("the site code outbox", () => {
    let dir: string;
    beforeEach(() => {
        dir = mkdtempSync(path.join(tmpdir(), "outbox-spec-"));
    });
    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
    });

    it("keeps the last code per address, whatever its case", () => {
        writeSiteCodeOutbox("Asha@Example.in", "111111", dir);
        writeSiteCodeOutbox("asha@example.in", "222222", dir);

        const file = siteCodeOutboxPath(" ASHA@example.in ", dir);
        expect(readFileSync(file, "utf8")).toBe("222222");
        expect(path.basename(file)).toBe("asha%40example.in");
    });

    it("never throws when it can't write", () => {
        expect(() =>
            writeSiteCodeOutbox("a@b.in", "123456", "/dev/null/not-a-dir"),
        ).not.toThrow();
    });
});

describe("siteCodesFakeAllowed", () => {
    it("runs in development, and elsewhere only when named", () => {
        expect(siteCodesFakeAllowed("development", undefined)).toBe(true);
        expect(siteCodesFakeAllowed(undefined, "log")).toBe(true);
        expect(siteCodesFakeAllowed("test", "fail")).toBe(true);
        expect(siteCodesFakeAllowed(undefined, undefined)).toBe(false);
        expect(siteCodesFakeAllowed("test", undefined)).toBe(false);
    });

    it("never runs in production, even when named", () => {
        expect(siteCodesFakeAllowed("production", "log")).toBe(false);
        expect(siteCodesFakeAllowed("production", "fail")).toBe(false);
    });
});
