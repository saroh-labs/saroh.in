/**
 * The job that sends one automatic refund (round-2 G13, DEC-032). Its own
 * file so a reader of the queue (a closing business's refunds, #921) can
 * name it without importing the payments service.
 */
export const SEND_REFUND_TYPE = "payments.send-refund";
