-- A phone-only customer (DEC-196) can ask to remove their data: the request
-- keeps the number Saroh tells them on (WhatsApp, Follow-ups), only when
-- they have no email, and loses it once the "done" notice has been tried.
ALTER TABLE "CustomerDataRequest" ADD COLUMN "requesterPhoneE164" TEXT;

-- Until the request is done there is always someone to tell.
ALTER TABLE "CustomerDataRequest" DROP CONSTRAINT "CustomerDataRequest_email_until_done";
ALTER TABLE "CustomerDataRequest" ADD CONSTRAINT "CustomerDataRequest_email_until_done"
    CHECK ("requesterEmail" IS NOT NULL OR "requesterPhoneE164" IS NOT NULL OR status = 'DONE');
