ALTER TABLE "users"
ADD COLUMN "comunicacaoSuspensoAte" TIMESTAMP(3),
ADD COLUMN "comunicacaoSuspensoMotivo" TEXT;

ALTER TABLE "comunicacao_posts"
ADD COLUMN "moderadoAt" TIMESTAMP(3),
ADD COLUMN "moderadoPorId" TEXT,
ADD COLUMN "moderadorRole" "UserRole",
ADD COLUMN "motivoModeracao" TEXT;
