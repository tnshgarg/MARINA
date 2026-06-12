CREATE TABLE "membership_managers" (
	"id" serial PRIMARY KEY NOT NULL,
	"membership_id" integer NOT NULL,
	"manager_membership_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "membership_managers" ADD CONSTRAINT "membership_managers_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_managers" ADD CONSTRAINT "membership_managers_manager_membership_id_memberships_id_fk" FOREIGN KEY ("manager_membership_id") REFERENCES "public"."memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "membership_managers_pair_uniq" ON "membership_managers" USING btree ("membership_id","manager_membership_id");--> statement-breakpoint
CREATE INDEX "membership_managers_manager_idx" ON "membership_managers" USING btree ("manager_membership_id");