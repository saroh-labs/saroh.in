-- A removed customer's name and email leave their data request (review #19):
-- the name when the removal marks it DONE, the email once Saroh's "done"
-- email to them has gone. The row stays as the record that they asked.
ALTER TABLE "CustomerDataRequest" ALTER COLUMN "requesterEmail" DROP NOT NULL;

-- Until the request is done there is always someone to tell.
ALTER TABLE "CustomerDataRequest" ADD CONSTRAINT "CustomerDataRequest_email_until_done"
    CHECK ("requesterEmail" IS NOT NULL OR status = 'DONE');
