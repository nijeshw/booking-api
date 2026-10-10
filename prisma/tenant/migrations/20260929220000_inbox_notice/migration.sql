CREATE TABLE "InboxNotice" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboxNotice_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InboxNotice_userId_createdAt_idx" ON "InboxNotice"("userId", "createdAt");
