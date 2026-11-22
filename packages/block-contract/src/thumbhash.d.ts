// `thumbhash` ships no types; these are the calls Saroh makes.
declare module "thumbhash" {
    export function rgbaToThumbHash(
        w: number,
        h: number,
        rgba: ArrayLike<number>,
    ): Uint8Array;
    export function thumbHashToDataURL(hash: ArrayLike<number>): string;
}
