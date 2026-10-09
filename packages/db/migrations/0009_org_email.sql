CREATE TABLE "org_email_settings" (
	"org_id" uuid PRIMARY KEY NOT NULL,
	"mode" text DEFAULT 'platform' NOT NULL,
	"from_name" text,
	"reply_to" text,
	"domain_name" text,
	"domain_provider_id" text,
	"domain_status" text,
	"domain_records" jsonb,
	"domain_from_email" text,
	"domain_verified_at" timestamp with time zone,
	"smtp_host" text,
	"smtp_port" integer,
	"smtp_security" text,
	"smtp_username" text,
	"smtp_password_enc" text,
	"smtp_from_email" text,
	"smtp_verified_at" timestamp with time zone,
	"last_error" text,
	"last_error_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "org_email_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "org_email_settings" ADD CONSTRAINT "org_email_settings_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "org_email_settings_domain_key" ON "org_email_settings" USING btree (lower("domain_name")) WHERE "org_email_settings"."domain_name" is not null;