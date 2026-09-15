ALTER TABLE "companyEnrichment" ALTER COLUMN "source" SET DEFAULT 'bright-data';
ALTER TABLE "appSetting" DROP COLUMN IF EXISTS "contextDevApiKey";
