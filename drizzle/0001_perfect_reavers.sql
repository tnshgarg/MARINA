CREATE TABLE "blocker_thread" (
	"id" serial PRIMARY KEY NOT NULL,
	"break_id" integer NOT NULL,
	"author_user_id" integer NOT NULL,
	"kind" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deliverables" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"org_id" integer,
	"title" text NOT NULL,
	"detail" text,
	"url" text,
	"kind" text,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"pinned_shot_at" timestamp with time zone,
	"verification_status" text DEFAULT 'unverified' NOT NULL,
	"verification_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_meetings" (
	"id" serial PRIMARY KEY NOT NULL,
	"org_id" integer NOT NULL,
	"organiser_user_id" integer NOT NULL,
	"attendee_user_id" integer NOT NULL,
	"title" text NOT NULL,
	"agenda" text,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"google_event_id" text,
	"conference_url" text,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "breaks" ADD COLUMN "resolved_by_user_id" integer;--> statement-breakpoint
ALTER TABLE "breaks" ADD COLUMN "resolution_note" text;--> statement-breakpoint
ALTER TABLE "breaks" ADD COLUMN "resolution_type" text;--> statement-breakpoint
ALTER TABLE "invites" ADD COLUMN "discipline" text DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "invites" ADD COLUMN "job_title" text;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "discipline" text DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "job_title" text;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "extra_caps" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "reports_to_membership_id" integer;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "working_days" jsonb DEFAULT '[false,true,true,true,true,true,false]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "tracked_github_orgs" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "birthday_mm_dd" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "joined_on" text;--> statement-breakpoint
ALTER TABLE "blocker_thread" ADD CONSTRAINT "blocker_thread_break_id_breaks_id_fk" FOREIGN KEY ("break_id") REFERENCES "public"."breaks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocker_thread" ADD CONSTRAINT "blocker_thread_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_meetings" ADD CONSTRAINT "scheduled_meetings_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_meetings" ADD CONSTRAINT "scheduled_meetings_organiser_user_id_users_id_fk" FOREIGN KEY ("organiser_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_meetings" ADD CONSTRAINT "scheduled_meetings_attendee_user_id_users_id_fk" FOREIGN KEY ("attendee_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blocker_thread_break_idx" ON "blocker_thread" USING btree ("break_id","created_at");--> statement-breakpoint
CREATE INDEX "deliverables_user_completed_idx" ON "deliverables" USING btree ("user_id","completed_at");--> statement-breakpoint
CREATE INDEX "deliverables_org_recent_idx" ON "deliverables" USING btree ("org_id","completed_at");--> statement-breakpoint
CREATE INDEX "scheduled_meetings_organiser_idx" ON "scheduled_meetings" USING btree ("organiser_user_id","start_at");--> statement-breakpoint
CREATE INDEX "scheduled_meetings_attendee_idx" ON "scheduled_meetings" USING btree ("attendee_user_id","start_at");--> statement-breakpoint
CREATE INDEX "scheduled_meetings_org_idx" ON "scheduled_meetings" USING btree ("org_id","start_at");--> statement-breakpoint
ALTER TABLE "breaks" ADD CONSTRAINT "breaks_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;