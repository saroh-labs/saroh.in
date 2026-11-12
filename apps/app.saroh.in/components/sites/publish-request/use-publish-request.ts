"use client";

import { showError } from "@saroh/ui/toast";
import { useState } from "react";

import { previewUrl } from "@/components/sites/review/preview-links";
import { runAction } from "@/lib/api/run-action";
import { createPreviewLink } from "@/lib/sites/actions";
import type {
    PublishRequestAnswer,
    PublishRequestView,
} from "@/lib/sites/publish-requests";
import { stateOf } from "@/lib/sites/publish-requests";
import {
    confirmPublishRequest,
    declinePublishRequest,
} from "@/lib/sites/publish-requests-actions";

/**
 * The publish request screen's state and its two answers (DEC-215 as
 * amended 12 Nov 2026). Nothing happens on load: only Publish (or Send for
 * approval) and Don't publish, pressed by the signed-in person, answer it.
 * A refusal the API names (expired, already answered, the draft changed)
 * moves the screen to that state; anything else is said in the foot.
 */
export function usePublishRequest(view: PublishRequestView, requestId: string) {
    const [answered, setAnswered] = useState<PublishRequestAnswer | null>(null);
    const [refusedWith, setRefusedWith] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState<"confirm" | "decline" | null>(null);
    const [previewing, setPreviewing] = useState(false);

    async function answer(how: "confirm" | "decline") {
        setError(null);
        const res = await runAction(
            () =>
                how === "confirm"
                    ? confirmPublishRequest(view.siteId, requestId)
                    : declinePublishRequest(view.siteId, requestId),
            { setBusy: (on) => setBusy(on ? how : null) },
        );
        if (!res) return;
        if (res.ok) {
            setAnswered(res.data);
            return;
        }
        if (res.code) setRefusedWith(res.code);
        // A refusal with a state of its own says it there.
        if (!res.code || stateOf(view, null, res.code) === "open") {
            setError(res.error);
        }
    }

    /** A one-day preview of the draft, in a new tab opened inside the press. */
    async function openPreview() {
        const tab =
            typeof window === "undefined"
                ? null
                : window.open("about:blank", "_blank");
        const res = await runAction(() => createPreviewLink(view.siteId, 1), {
            setBusy: setPreviewing,
        });
        if (!res?.ok) {
            tab?.close();
            if (res) showError(res.error);
            return;
        }
        const url = previewUrl(res.data.token);
        if (tab) {
            tab.opener = null;
            tab.location.href = url;
        } else {
            window.open(url, "_blank", "noopener");
        }
    }

    return {
        state: stateOf(view, answered, refusedWith),
        answered,
        error,
        busy,
        previewing,
        confirm: () => answer("confirm"),
        decline: () => answer("decline"),
        openPreview,
    };
}
