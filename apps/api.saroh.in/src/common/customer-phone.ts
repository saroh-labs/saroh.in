/**
 * A phone a customer types on a business's site: the booking page's
 * "Phone" (UX-049) and the delivery address at the site's checkout. Digits
 * with the spaces, brackets and dashes people write them with, and an
 * optional leading +. Loose on purpose: it is a number to ring, never a way
 * to sign in.
 */
export const CUSTOMER_PHONE = /^\+?[\d\s()-]{6,24}$/;

/** Whether a value reads as a phone someone could ring. */
export function isCustomerPhone(value: string | null | undefined): boolean {
    const phone = value?.trim() ?? "";
    // Brackets and dashes alone are not a number: six digits at least.
    return CUSTOMER_PHONE.test(phone) && phone.replace(/\D/g, "").length >= 6;
}
