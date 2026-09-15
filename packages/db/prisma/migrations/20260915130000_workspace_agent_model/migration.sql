CREATE TABLE "workspaceAgentModel" (
    "workspaceId" TEXT NOT NULL,
    "modelId" TEXT,
    "modelContextWindow" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspaceAgentModel_pkey" PRIMARY KEY ("workspaceId")
);

ALTER TABLE "workspaceAgentModel" ADD CONSTRAINT "workspaceAgentModel_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
