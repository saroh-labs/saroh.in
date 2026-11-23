import assert from "node:assert/strict";
import { test } from "node:test";

import { MEDIA_HEADERS, headerProblems } from "./check-media-headers.mjs";

test("the rule's headers pass, from Headers or a plain object", () => {
    assert.deepEqual(headerProblems(new Headers(MEDIA_HEADERS)), []);
    assert.deepEqual(
        headerProblems({
            "Content-Security-Policy": MEDIA_HEADERS["content-security-policy"],
            "X-Content-Type-Options": "nosniff",
        }),
        [],
    );
});

test("a missing or changed header fails", () => {
    assert.deepEqual(headerProblems(new Headers()), [
        "content-security-policy missing",
        "x-content-type-options missing",
    ]);
    const loose = new Headers({
        ...MEDIA_HEADERS,
        "content-security-policy": "default-src 'none'",
    });
    assert.equal(headerProblems(loose).length, 1);
});
