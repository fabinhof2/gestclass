-- CreateTable
CREATE TABLE "user_school_links" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_school_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_school_links_schoolId_idx" ON "user_school_links"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "user_school_links_userId_schoolId_key" ON "user_school_links"("userId", "schoolId");

-- AddForeignKey
ALTER TABLE "user_school_links" ADD CONSTRAINT "user_school_links_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_school_links" ADD CONSTRAINT "user_school_links_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
