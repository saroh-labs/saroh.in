const WORDS =
    "no one two three four five six seven eight nine ten eleven twelve".split(
        " ",
    );

/** "seven" ("Seven" to start a sentence); digits past twelve (DEC-195, B13). */
export function numberWord(n: number, { capital = false } = {}): string {
    if (!Number.isInteger(n) || n < 0 || n >= WORDS.length) return String(n);
    const word = WORDS[n];
    return capital ? word[0].toUpperCase() + word.slice(1) : word;
}
