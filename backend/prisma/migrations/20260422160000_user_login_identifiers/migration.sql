-- Add optional login identifiers.
ALTER TABLE "users" ADD COLUMN "username" TEXT;
ALTER TABLE "users" ADD COLUMN "cpfNormalized" TEXT;

UPDATE "users"
SET "cpfNormalized" = NULLIF(regexp_replace("cpf", '\D', '', 'g'), '')
WHERE "cpf" IS NOT NULL;

CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
CREATE INDEX "users_cpfNormalized_idx" ON "users"("cpfNormalized");

CREATE OR REPLACE FUNCTION set_user_cpf_normalized()
RETURNS trigger AS $$
BEGIN
  NEW."cpfNormalized" := NULLIF(regexp_replace(COALESCE(NEW."cpf", ''), '\D', '', 'g'), '');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_cpf_normalized_trigger
BEFORE INSERT OR UPDATE OF "cpf" ON "users"
FOR EACH ROW
EXECUTE FUNCTION set_user_cpf_normalized();
