import { afterEach, describe, expect, it, vi } from "vitest";

import { putWithProgress } from "./media-picker";

/** A stand-in XHR that records what was sent and answers `status`. */
function fakeXhr(status: number) {
    const sent: Record<string, string> = {};
    class Xhr {
        status = status;
        upload = { onprogress: null };
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        open = vi.fn();
        setRequestHeader(k: string, v: string) {
            sent[k] = v;
        }
        send() {
            this.onload?.();
        }
    }
    vi.stubGlobal("XMLHttpRequest", Xhr);
    return sent;
}

const headers = {
    "Content-Type": "image/webp",
    "Content-Length": "3",
    "If-None-Match": "*",
};

describe("putWithProgress — a one-use upload URL (F3)", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("sends If-None-Match: * with the signed headers", async () => {
        const sent = fakeXhr(200);
        await putWithProgress(
            "https://r2.test/k",
            headers,
            new Blob(["abc"]),
            () => undefined,
        );
        expect(sent["If-None-Match"]).toBe("*");
        expect(sent["Content-Type"]).toBe("image/webp");
        expect(sent["Content-Length"]).toBeUndefined();
    });

    it("fails the upload on 412, never a silent pass", async () => {
        fakeXhr(412);
        await expect(
            putWithProgress(
                "https://r2.test/k",
                headers,
                new Blob(["abc"]),
                () => undefined,
            ),
        ).rejects.toThrow(/couldn't save this file just now \(412\)/);
    });
});
