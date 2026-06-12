CREATE TABLE "early_bird_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"plan" text DEFAULT 'team' NOT NULL,
	"duration_days" integer,
	"max_redemptions" integer DEFAULT 1 NOT NULL,
	"used_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_by_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "early_bird_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "early_bird_redemptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"code_id" integer NOT NULL,
	"org_id" integer NOT NULL,
	"redeemed_by_user_id" integer NOT NULL,
	"granted_plan" text NOT NULL,
	"grant_expires_at" timestamp with time zone,
	"redeemed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "early_bird_codes" ADD CONSTRAINT "early_bird_codes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "early_bird_redemptions" ADD CONSTRAINT "early_bird_redemptions_code_id_early_bird_codes_id_fk" FOREIGN KEY ("code_id") REFERENCES "public"."early_bird_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "early_bird_redemptions" ADD CONSTRAINT "early_bird_redemptions_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "early_bird_redemptions" ADD CONSTRAINT "early_bird_redemptions_redeemed_by_user_id_users_id_fk" FOREIGN KEY ("redeemed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "early_bird_codes_active_idx" ON "early_bird_codes" USING btree ("is_active","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "early_bird_redemptions_code_org_uniq" ON "early_bird_redemptions" USING btree ("code_id","org_id");--> statement-breakpoint
CREATE INDEX "early_bird_redemptions_org_idx" ON "early_bird_redemptions" USING btree ("org_id");