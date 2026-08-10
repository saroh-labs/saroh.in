-- Org-isolation RLS for the stage 2-7 tables.
--
-- REWRITTEN (2026-08-10) to be order-safe. The original form issued
-- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` and `CREATE POLICY` directly
-- against 41 tables, but this migration is timestamped BEFORE the migrations
-- that create 14 of them (bookings, payments, communications, automation_runs)
-- and before `20260719184929_commerce_org_scope` adds `organizationId` to
-- Cart/Category/Customer/Inventory/Order/Product. It therefore could not
-- replay on a fresh database — it only ever succeeded where the schema already
-- existed. A new environment failed here with:
--
--     ERROR: column "organizationId" does not exist  (SQLSTATE 42703)
--
-- Timestamps are the ordering key and this migration is already applied
-- elsewhere, so it cannot simply be moved. Instead each table is now applied
-- only if it exists AND carries `organizationId`; the tables skipped on a fresh
-- database are picked up by `20260719210000_rls_backfill_org_isolation`, which
-- runs after every table exists and is deliberately NOT guarded so a genuinely
-- missing table fails loudly.
--
-- Semantics are unchanged: same 41 tables, same policy, same permissive
-- behaviour when `app.current_organization_id` is unset.

DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'Media',
        'Product',
        'Category',
        'Inventory',
        'Customer',
        'Cart',
        'Order',
        'FeatureFlagAudit',
        'Site',
        'Page',
        'PageVersion',
        'Section',
        'Publication',
        'Domain',
        'Contact',
        'Form',
        'Submission',
        'Pipeline',
        'Stage',
        'Lead',
        'Activity',
        'Job',
        'Notification',
        'Service',
        'AvailabilityRule',
        'Booking',
        'MerchantPaymentProvider',
        'PaymentIntent',
        'PaymentAttempt',
        'PaymentRefund',
        'WebhookEvent',
        'CommunicationProvider',
        'Message',
        'Delivery',
        'Consent',
        'AutomationRule',
        'AutomationRun',
        'AnalyticsEvent',
        'AnalyticsDailyAggregate',
        'Subscription',
        'BillingWebhookEvent'
    ]
    LOOP
        -- Guard on the COLUMN, not just the table: six of these tables exist at
        -- this point but do not gain `organizationId` until a later migration,
        -- and the policy body references it.
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = t
              AND column_name = 'organizationId'
        ) THEN
            EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
            EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
            EXECUTE format('DROP POLICY IF EXISTS "org_isolation" ON %I', t);
            EXECUTE format(
                'CREATE POLICY "org_isolation" ON %I'
                ' USING (current_setting(''app.current_organization_id'', true) IS NULL'
                '        OR "organizationId" = current_setting(''app.current_organization_id'', true))'
                ' WITH CHECK (current_setting(''app.current_organization_id'', true) IS NULL'
                '        OR "organizationId" = current_setting(''app.current_organization_id'', true))',
                t);
        END IF;
    END LOOP;
END $$;
