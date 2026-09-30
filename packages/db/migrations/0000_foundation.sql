CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"owner_type" text NOT NULL,
	"owner_id" text NOT NULL,
	"file_key" text NOT NULL,
	"name" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "attachments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "local_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "local_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "local_users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "local_users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"image" text,
	"roles" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"recipient_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "org_settings" (
	"org_id" uuid PRIMARY KEY NOT NULL,
	"terms" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled_pillars" text[] DEFAULT array['people','work','collab','finance']::text[] NOT NULL,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "org_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "orgs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"external_id" text,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orgs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sequences" (
	"org_id" uuid NOT NULL,
	"key" text NOT NULL,
	"next_value" bigint DEFAULT 1 NOT NULL,
	CONSTRAINT "sequences_org_id_key_pk" PRIMARY KEY("org_id","key")
);
--> statement-breakpoint
ALTER TABLE "sequences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "webhook_receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "webhook_receipts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_sessions" ADD CONSTRAINT "local_sessions_user_id_local_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."local_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_settings" ADD CONSTRAINT "org_settings_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequences" ADD CONSTRAINT "sequences_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_owner_idx" ON "attachments" USING btree ("org_id","owner_type","owner_id");--> statement-breakpoint
CREATE INDEX "audit_events_org_created_idx" ON "audit_events" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "local_sessions_user_idx" ON "local_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "local_users_email_key" ON "local_users" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "members_org_user_key" ON "members" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE INDEX "members_org_idx" ON "members" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "notifications_recipient_idx" ON "notifications" USING btree ("org_id","recipient_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "orgs_external_id_key" ON "orgs" USING btree ("external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orgs_slug_key" ON "orgs" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_org_key_key" ON "roles" USING btree ("org_id","key");