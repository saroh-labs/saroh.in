/**
 * What someone wrote through one of the site's enquiry forms, as the API
 * sends it on a lead and on a contact (UX-002): each answer labelled by its
 * field, in the form's order, newest entry first.
 */

export interface EnquiryAnswer {
    name: string;
    label: string;
    value: string;
}

export interface EnquiryEntry {
    id: string;
    createdAt: string;
    formId: string;
    formName: string | null;
    answers: EnquiryAnswer[];
}

/**
 * The answers worth showing under a heading that already names the person:
 * their email address repeats what the page header says, so it goes, unless
 * it is all they gave.
 */
export function answersToShow(
    answers: EnquiryAnswer[],
    knownEmail: string | null,
): EnquiryAnswer[] {
    const known = knownEmail?.trim().toLowerCase();
    const rest = known
        ? answers.filter((a) => a.value.trim().toLowerCase() !== known)
        : answers;
    return rest.length > 0 ? rest : answers;
}

/** A long answer (a message) takes the full row. */
export function isLongAnswer(answer: EnquiryAnswer): boolean {
    return answer.value.length > 60 || answer.value.includes("\n");
}
