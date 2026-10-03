CREATE TABLE "installment_plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"principal" bigint DEFAULT 0 NOT NULL,
	"annual_rate" numeric(5, 2) DEFAULT 0 NOT NULL,
	"count" integer NOT NULL,
	"frequency" text DEFAULT 'monthly' NOT NULL,
	"first_due_date" date NOT NULL,
	"interest_tax_rate" numeric(5, 2) DEFAULT 18 NOT NULL,
	"original_due_date" date,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "installment_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "installments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"due_date" date NOT NULL,
	"principal" bigint DEFAULT 0 NOT NULL,
	"interest" bigint DEFAULT 0 NOT NULL,
	"interest_invoice_id" uuid,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"amount_paid" bigint DEFAULT 0 NOT NULL,
	"billed_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"payment_link_id" text,
	"payment_link_url" text,
	"last_reminder_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "installments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "installment_id" uuid;--> statement-breakpoint
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installments" ADD CONSTRAINT "installments_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installments" ADD CONSTRAINT "installments_plan_id_installment_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."installment_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installments" ADD CONSTRAINT "installments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "installment_plans_invoice_idx" ON "installment_plans" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "installment_plans_active_key" ON "installment_plans" USING btree ("invoice_id") WHERE "installment_plans"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "installments_plan_seq_key" ON "installments" USING btree ("plan_id","seq");--> statement-breakpoint
CREATE INDEX "installments_org_due_idx" ON "installments" USING btree ("org_id","status","due_date");--> statement-breakpoint
CREATE INDEX "installments_invoice_idx" ON "installments" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "installments_interest_invoice_idx" ON "installments" USING btree ("interest_invoice_id");--> statement-breakpoint
CREATE INDEX "installments_link_idx" ON "installments" USING btree ("payment_link_id");--> statement-breakpoint
CREATE INDEX "payments_installment_idx" ON "payments" USING btree ("installment_id");