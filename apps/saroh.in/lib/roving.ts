const STEP: Partial<Record<string, number>> = {
    ArrowDown: 1,
    ArrowRight: 1,
    ArrowUp: -1,
    ArrowLeft: -1,
};

/**
 * Where an arrow key moves focus in a row (or menu) of `count`, wrapping at
 * either end; null for any other key (DEC-195, B6). From nothing focused
 * (`i` = -1), Down goes to the first.
 */
export function nextIndex(
    key: string,
    i: number,
    count: number,
): number | null {
    const step = STEP[key];
    return step ? (i + step + count) % count : null;
}
