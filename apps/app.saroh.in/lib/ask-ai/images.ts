import {
    ASK_AI_IMAGE_MAX_BYTES,
    ASK_AI_IMAGE_TYPES,
    ASK_AI_IMAGES_MAX,
} from "@saroh/api-contract";

/**
 * Images in Ask AI's box (owner, 22 Nov; boards AIImgCompose, AIImgStates):
 * which files may be added, the one line to say when some can't, and the
 * count under the box. Pure, so a test reads every word.
 */

/** One picture in the box: uploading, in, or failed. */
export interface Attachment {
    key: string;
    name: string;
    status: "uploading" | "ready" | "failed";
    /** 0 to 100 while uploading. */
    progress: number;
    /** What the thumbnail draws: the file as picked, or a library photo's address. */
    preview: string | null;
    /** Its media id once it is in. */
    mediaId?: string;
    /** Why it didn't upload, in words. */
    error?: string;
    /** The file, kept to try again. */
    file?: File;
}

export const TYPE_WORDS = "Choose a JPG, PNG, WebP or GIF.";
export const TOO_MANY_WORDS = `Up to ${ASK_AI_IMAGES_MAX} images in one message.`;
export const ONE_MESSAGE_WORDS = "Up to 10 images in one message";
export const SLOW_WORDS =
    "Slow connection. Still uploading. You can keep typing.";

/** 14.2 MB, as the board says it. */
export function megabytes(bytes: number): string {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Picked {
    name: string;
    type: string;
    size: number;
}

const isReadable = (type: string) =>
    (ASK_AI_IMAGE_TYPES as readonly string[]).includes(type);

/**
 * The files that fit in the box, in the order picked, and the one line to
 * say about the rest: a wrong type (naming it), then one too large, then
 * "3 weren't added" for those past ten. A photo is re-drawn smaller before
 * it goes up, so only a file that goes up as it is (a GIF) is turned away
 * for its size here; the server's own cap answers for any other.
 */
export function admit<F extends Picked>(
    room: number,
    files: readonly F[],
): { take: F[]; problem: string | null } {
    let wrong: string | null = null;
    let large: string | null = null;
    const fine: F[] = [];
    for (const f of files) {
        if (!isReadable(f.type)) {
            wrong ??= `${f.name} isn't an image. ${TYPE_WORDS}`;
        } else if (f.type === "image/gif" && f.size > ASK_AI_IMAGE_MAX_BYTES) {
            large ??= `${f.name} is ${megabytes(f.size)}. Each image can be up to ${ASK_AI_IMAGE_MAX_BYTES / (1024 * 1024)} MB.`;
        } else {
            fine.push(f);
        }
    }
    const take = fine.slice(0, Math.max(0, room));
    const left = fine.length - take.length;
    const many =
        left > 0
            ? `${TOO_MANY_WORDS} ${left} ${left === 1 ? "wasn't" : "weren't"} added.`
            : null;
    return { take, problem: wrong ?? large ?? many };
}

/** The count under the box: "4 of 10 · 2 uploading", "10 of 10 · the most for one message". */
export function countWords(list: readonly Attachment[]): string | null {
    if (list.length === 0) return null;
    const uploading = list.filter((a) => a.status === "uploading").length;
    const base = `${list.length} of ${ASK_AI_IMAGES_MAX}`;
    if (uploading) return `${base} · ${uploading} uploading`;
    return list.length >= ASK_AI_IMAGES_MAX
        ? `${base} · the most for one message`
        : base;
}

/** The one line inside the box, the worst first: a failed upload, then a problem, then a slow one. */
export type BoxLine =
    | { kind: "failed"; key: string; words: string }
    | { kind: "problem"; words: string }
    | { kind: "slow"; words: string };

export function boxLine(
    list: readonly Attachment[],
    problem: string | null,
    slow: boolean,
): BoxLine | null {
    const failed = list.find((a) => a.status === "failed");
    if (failed) {
        return {
            kind: "failed",
            key: failed.key,
            words: `${failed.name} didn't upload.`,
        };
    }
    if (problem) return { kind: "problem", words: problem };
    if (slow && list.some((a) => a.status === "uploading")) {
        return { kind: "slow", words: SLOW_WORDS };
    }
    return null;
}

/** Whether Ask can go: every image is in (none still going or failed). */
export const settled = (list: readonly Attachment[]) =>
    list.every((a) => a.status === "ready");
