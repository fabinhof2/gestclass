ALTER TABLE "financeiro_configuracoes"
ADD COLUMN "gestorAccessEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "secretariaAccessEnabled" BOOLEAN NOT NULL DEFAULT true;
