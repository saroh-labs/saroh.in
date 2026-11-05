-- A report keeps the edition of the address it came through (DEC-204). Every
-- report so far came through saroh.in's.
ALTER TABLE "BusinessReport" ADD COLUMN     "edition" "Edition" NOT NULL DEFAULT 'INDIA';
