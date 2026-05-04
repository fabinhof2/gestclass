ALTER TABLE "solicitacoes"
ADD COLUMN "protocoloAno" INTEGER,
ADD COLUMN "protocoloDigitos" INTEGER,
ADD COLUMN "protocoloNumero" TEXT;

CREATE UNIQUE INDEX "solicitacoes_protocoloAno_protocoloNumero_key"
ON "solicitacoes"("protocoloAno", "protocoloNumero");
