import { isSerializationFailure } from "./prisma-errors";

/**
 * Run a serializable write again when it loses a race (Postgres 40001),
 * up to `tries` times in all, waiting 20 to 80 ms of jitter between tries
 * so two writers that collided don't collide again in step (review #33).
 * Any other error, and the last try's serialization failure, is thrown
 * as it is: the caller says what losing every try means, in honest words
 * ("Lots of people are booking right now"), never "fully booked".
 */
export async function retrySerializable<T>(
    write: () => Promise<T>,
    options: {
        tries?: number;
        /** Waits `ms`; a spec passes one that doesn't. */
        sleep?: (ms: number) => Promise<void>;
    } = {},
): Promise<T> {
    const tries = Math.max(1, options.tries ?? SERIALIZABLE_TRIES);
    const sleep =
        options.sleep ??
        ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    for (let attempt = 1; ; attempt += 1) {
        try {
            return await write();
        } catch (err) {
            if (attempt >= tries || !isSerializationFailure(err)) throw err;
            await sleep(20 + Math.floor(Math.random() * 61));
        }
    }
}

/** How many times a serializable booking write is tried in all. */
export const SERIALIZABLE_TRIES = 3;
