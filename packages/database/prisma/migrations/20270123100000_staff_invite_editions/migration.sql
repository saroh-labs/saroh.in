-- Which consoles a staff invite's grant opens once accepted (DEC-204). Additive,
-- with India's default, so an invite already waiting reads as it always did.
ALTER TABLE "StaffInvite" ADD COLUMN "editions" "Edition"[] NOT NULL DEFAULT ARRAY['INDIA']::"Edition"[];
