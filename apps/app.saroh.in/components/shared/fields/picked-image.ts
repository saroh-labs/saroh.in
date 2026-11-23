/**
 * Small pieces of a picked photo, apart from the upload itself so a test
 * that stands in for the upload keeps them (DEC-246).
 */

/** The fields a section's image keeps from a picked photo (DEC-246). */
export function pickedSizes(picked: {
    placeholder?: string;
    widths?: number[];
}): { placeholder?: string; widths?: number[] } {
    return {
        ...(picked.placeholder ? { placeholder: picked.placeholder } : {}),
        ...(picked.widths?.length ? { widths: picked.widths } : {}),
    };
}

/**
 * What an upload button says while it works: first while the photo is
 * made ready on the device, then the upload's progress.
 */
export function uploadWords(state: {
    preparing: boolean;
    progress: number | null;
}): string {
    if (state.preparing) return "Getting your photo ready…";
    return state.progress === null
        ? "Uploading…"
        : `Uploading ${state.progress}%`;
}
