-- Admin per edition (DEC-204): which consoles a staff member may open, and the
-- edition of what has no business to read it from. Additive, with defaults, so
-- the running API keeps working and every existing row reads as India.
ALTER TABLE "PlatformAdmin" ADD COLUMN "editions" "Edition"[] NOT NULL DEFAULT ARRAY['INDIA']::"Edition"[];
ALTER TABLE "SarohLead" ADD COLUMN "edition" "Edition" NOT NULL DEFAULT 'INDIA';
ALTER TABLE "WaitlistSignup" ADD COLUMN "edition" "Edition" NOT NULL DEFAULT 'INDIA';
ALTER TABLE "ContactMessage" ADD COLUMN "edition" "Edition" NOT NULL DEFAULT 'INDIA';
