import { Zip, ZipDeflate, ZipPassThrough } from "fflate";
import { once } from "node:events";
import type { WriteStream } from "node:fs";
import { createWriteStream } from "node:fs";
import { finished } from "node:stream/promises";

/**
 * A zip written to a file on disk as it is made (DEC-120): one entry at a
 * time, each streamed in, so a big business's export never sits in memory.
 * The file waits for the disk when the disk is behind.
 *
 * fflate writes no ZIP64, so an archive stays under 4 GiB: the export
 * caps what it puts in (`DATA_EXPORT_MEDIA_BYTES`) well below that.
 */
export class ZipFile {
    private readonly out: WriteStream;
    private readonly zip: Zip;
    private failed: Error | null = null;
    private readonly written: Promise<void>;
    /** Bytes of zip written so far. */
    bytes = 0;

    constructor(path: string) {
        this.out = createWriteStream(path);
        this.written = finished(this.out);
        // Keep the stream's own error for `close`, not as an unhandled one.
        this.written.catch((error: unknown) => {
            this.failed ??= error as Error;
        });
        this.zip = new Zip((error, chunk, final) => {
            if (error) {
                this.failed ??= error;
                return;
            }
            this.bytes += chunk.byteLength;
            this.out.write(chunk);
            if (final) this.out.end();
        });
    }

    /**
     * Add one entry from its chunks, finished before the next is added.
     * `compress` deflates (CSV); otherwise the bytes are stored as they are
     * (photos and videos, already compressed).
     */
    async add(
        name: string,
        chunks:
            AsyncIterable<Uint8Array | string> | Iterable<Uint8Array | string>,
        options: { compress: boolean; modified?: Date },
    ): Promise<number> {
        const entry = options.compress
            ? new ZipDeflate(name, { level: 6 })
            : new ZipPassThrough(name);
        entry.mtime = options.modified ?? new Date();
        this.zip.add(entry);
        const encoder = new TextEncoder();
        let size = 0;
        let held: Uint8Array | null = null;
        for await (const chunk of chunks) {
            const bytes =
                typeof chunk === "string" ? encoder.encode(chunk) : chunk;
            size += bytes.byteLength;
            // One chunk held back, so the last can be pushed as final.
            if (held) entry.push(held);
            held = bytes;
            await this.keepUp();
        }
        entry.push(held ?? new Uint8Array(0), true);
        await this.keepUp();
        return size;
    }

    /** End the archive and wait for the file; the zip's size in bytes. */
    async close(): Promise<number> {
        this.throwIfFailed();
        this.zip.end();
        await this.written;
        this.throwIfFailed();
        return this.bytes;
    }

    /** Stop writing; the caller removes the file. */
    abort(): void {
        this.zip.terminate();
        this.out.destroy();
    }

    private async keepUp(): Promise<void> {
        this.throwIfFailed();
        if (this.out.writableNeedDrain) await once(this.out, "drain");
    }

    private throwIfFailed(): void {
        if (this.failed) throw this.failed;
    }
}
