/** What an invoice is for, from its first line: "Personal training × 4", "… + 2 more". */
export function forWhat(
    summary: {
        description: string;
        quantity: number;
        lineCount: number;
    } | null,
): string {
    if (!summary) return "No lines yet";
    const more = summary.lineCount - 1;
    if (more > 0) return `${summary.description} + ${more} more`;
    return summary.quantity > 1
        ? `${summary.description} × ${summary.quantity}`
        : summary.description;
}
