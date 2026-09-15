CREATE TABLE "workspacePreauthorization" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspacePreauthorization_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "workspacePreauthorization_role_check" CHECK ("role" = 'member')
);

CREATE UNIQUE INDEX "workspacePreauthorization_organizationId_email_key" ON "workspacePreauthorization"("organizationId", "email");
CREATE INDEX "workspacePreauthorization_organizationId_idx" ON "workspacePreauthorization"("organizationId");

ALTER TABLE "workspacePreauthorization" ADD CONSTRAINT "workspacePreauthorization_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "workspacePreauthorization" ("id", "organizationId", "email", "role", "createdAt")
SELECT 'workspace-preauthorization-mihai-goodsmartidea-com', 'workspace', 'mihai@goodsmartidea.com', 'member', CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "organization" WHERE "id" = 'workspace')
ON CONFLICT ("organizationId", "email") DO NOTHING;
