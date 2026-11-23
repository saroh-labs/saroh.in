"use client";

import { ASK_AI_IMAGES_MAX } from "@saroh/api-contract";
import { useCallback, useEffect, useRef, useState } from "react";

import { useImageUpload } from "@/components/shared/fields/media-picker";
import type { Attachment, BoxLine } from "@/lib/ask-ai/images";
import { admit, boxLine, settled } from "@/lib/ask-ai/images";
import type { LibraryItem } from "@/lib/media/service";

/** No progress for this long: say the connection is slow. */
const SLOW_AFTER_MS = 8_000;

let keys = 0;

/**
 * The images in Ask AI's box (owner, 22 Nov): picked, pasted, dropped or
 * chosen from Your photos, each prepared on the device and uploaded as a
 * chat image (kept with the conversation until one is applied). The host
 * holds it, so a box closed and opened again still has them.
 */
export function useAttachments() {
    const [items, setItems] = useState<Attachment[]>([]);
    const [problem, setProblem] = useState<string | null>(null);
    const [slow, setSlow] = useState(false);
    const { sendPhoto } = useImageUpload({
        purpose: "ask-ai",
        unserved: "It uploaded, but storage can't show it yet. Try again.",
    });
    const latest = useRef(items);
    // Read by callbacks at the moment of an event, so it follows after render.
    useEffect(() => {
        latest.current = items;
    });
    const lastProgress = useRef(0);

    const patch = useCallback((key: string, change: Partial<Attachment>) => {
        setItems((all) =>
            all.map((a) => (a.key === key ? { ...a, ...change } : a)),
        );
    }, []);

    const upload = useCallback(
        (key: string, file: File) => {
            lastProgress.current = Date.now();
            setSlow(false);
            patch(key, { status: "uploading", progress: 0, error: undefined });
            sendPhoto(file, "ask-ai", (progress) => {
                lastProgress.current = Date.now();
                patch(key, { progress });
            }).then(
                (sent) =>
                    patch(key, {
                        status: "ready",
                        progress: 100,
                        mediaId: sent.mediaId,
                    }),
                (error: unknown) =>
                    patch(key, {
                        status: "failed",
                        error:
                            error instanceof Error && error.message
                                ? error.message
                                : "The upload did not go through. Try again.",
                    }),
            );
        },
        [patch, sendPhoto],
    );

    const addFiles = useCallback(
        (files: File[]) => {
            const room = ASK_AI_IMAGES_MAX - latest.current.length;
            const { take, problem: said } = admit(room, files);
            setProblem(said);
            if (!take.length) return;
            const added = take.map((file): Attachment => ({
                key: `a${++keys}`,
                name: file.name,
                status: "uploading",
                progress: 0,
                preview: URL.createObjectURL(file),
                file,
            }));
            setItems((all) => [...all, ...added]);
            for (const a of added) if (a.file) upload(a.key, a.file);
        },
        [upload],
    );

    /** Photos chosen from Your photos: already in, nothing to upload. */
    const addLibrary = useCallback((chosen: LibraryItem[]) => {
        const have = new Set(latest.current.map((a) => a.mediaId));
        const fresh = chosen.filter((c) => !have.has(c.id));
        const { take, problem: said } = admit(
            ASK_AI_IMAGES_MAX - latest.current.length,
            fresh.map((c) => ({
                item: c,
                name: c.filename,
                type: c.contentType,
                size: c.sizeBytes ?? 0,
            })),
        );
        setProblem(said);
        setItems((all) => [
            ...all,
            ...take.map(({ item }): Attachment => ({
                key: `a${++keys}`,
                name: item.filename,
                status: "ready",
                progress: 100,
                preview: item.url,
                mediaId: item.id,
            })),
        ]);
    }, []);

    const revoke = (a: Attachment) => {
        if (a.file && a.preview) URL.revokeObjectURL(a.preview);
    };

    const remove = useCallback((key: string) => {
        setItems((all) => {
            const gone = all.find((a) => a.key === key);
            if (gone) revoke(gone);
            return all.filter((a) => a.key !== key);
        });
        setProblem(null);
    }, []);

    const retry = useCallback(
        (key: string) => {
            const a = latest.current.find((x) => x.key === key);
            if (a?.file) upload(key, a.file);
        },
        [upload],
    );

    /** Empties the box, keeping what was in it so a refused question can give it back. */
    const take = useCallback((): Attachment[] => {
        const all = latest.current;
        setItems([]);
        setProblem(null);
        return all;
    }, []);

    const restore = useCallback((back: Attachment[]) => {
        setItems((all) => (all.length ? all : back));
    }, []);

    // Slow: no progress for a while with something still going.
    const busy = items.some((a) => a.status === "uploading");
    useEffect(() => {
        if (!busy) return;
        const timer = window.setInterval(
            () => setSlow(Date.now() - lastProgress.current > SLOW_AFTER_MS),
            1_000,
        );
        return () => window.clearInterval(timer);
    }, [busy]);

    // Previews are made here: let them go with the box.
    useEffect(
        () => () => {
            for (const a of latest.current) revoke(a);
        },
        [],
    );

    const line: BoxLine | null = boxLine(items, problem, busy && slow);
    return {
        items,
        line,
        full: items.length >= ASK_AI_IMAGES_MAX,
        /** Every image is in; Ask may go. */
        settled: settled(items),
        mediaIds: items.flatMap((a) => (a.mediaId ? [a.mediaId] : [])),
        addFiles,
        addLibrary,
        remove,
        retry,
        take,
        restore,
    };
}

export type Attachments = ReturnType<typeof useAttachments>;
