/**
 * The self-rescheduling renewal job's type (ADR-007). Its own file so the
 * service can read the job's runs without importing the handler, which
 * imports the service.
 */
export const SUBSCRIPTION_RENEW_TYPE = "subscription.renew";
