CREATE TABLE "account" (
	"user_id" integer NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "account_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "agent_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"token_prefix" text NOT NULL,
	"label" text NOT NULL,
	"platform" text DEFAULT 'darwin' NOT NULL,
	"agent_version" text,
	"paired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ai_spend" (
	"id" serial PRIMARY KEY NOT NULL,
	"org_id" integer,
	"user_id" integer,
	"kind" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"image_count" integer DEFAULT 0 NOT NULL,
	"cost_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"org_id" integer,
	"actor_user_id" integer,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" integer,
	"payload" jsonb,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "breaks" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"org_id" integer,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"reason" text NOT NULL,
	"category" text DEFAULT 'other' NOT NULL,
	"waiting_on_user_id" integer,
	"waiting_on_external" text,
	"expected_end_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "daily_states" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"day" text NOT NULL,
	"state" text NOT NULL,
	"output_count" integer DEFAULT 0 NOT NULL,
	"online_seconds" integer DEFAULT 0 NOT NULL,
	"focus_work_ratio" integer DEFAULT 0 NOT NULL,
	"static_idle_runs" integer DEFAULT 0 NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_stories" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"day" date NOT NULL,
	"narrative" text NOT NULL,
	"scenes" jsonb NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "github_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" text NOT NULL,
	"repo" text NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"external_id" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"raw" jsonb
);
--> statement-breakpoint
CREATE TABLE "holidays" (
	"id" serial PRIMARY KEY NOT NULL,
	"org_id" integer,
	"region" text DEFAULT 'IN' NOT NULL,
	"date" date NOT NULL,
	"name" text NOT NULL,
	"is_optional" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" serial PRIMARY KEY NOT NULL,
	"org_id" integer NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"token" text NOT NULL,
	"invited_by" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "job_cursors" (
	"job" text PRIMARY KEY NOT NULL,
	"cursor" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"org_id" integer NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"leave_type" text DEFAULT 'casual' NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" integer,
	"decided_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "local_activity" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"agent_token_id" integer,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"active_app" text NOT NULL,
	"active_seconds" integer NOT NULL,
	"idle_seconds" integer NOT NULL,
	"sample_count" integer NOT NULL,
	"window_title" text
);
--> statement-breakpoint
CREATE TABLE "magic_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"requested_ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"provider" text DEFAULT 'google' NOT NULL,
	"external_id" text NOT NULL,
	"calendar_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"location" text,
	"conference_url" text,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"organizer_email" text,
	"attendees" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rsvp_status" text,
	"attended_at" timestamp with time zone,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" serial PRIMARY KEY NOT NULL,
	"org_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"role" text NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "narratives" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"body" text NOT NULL,
	"signal" text NOT NULL,
	"blockers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"org_id" integer,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"href" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orgs" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"owner_id" integer NOT NULL,
	"slack_webhook_url" text,
	"holiday_region" text DEFAULT 'IN',
	"avatar_mode" text DEFAULT 'hero' NOT NULL,
	"workday_start_hour" integer DEFAULT 9 NOT NULL,
	"workday_end_hour" integer DEFAULT 18 NOT NULL,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"seats_purchased" integer DEFAULT 5 NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"billing_provider" text,
	"billing_customer_id" text,
	"billing_subscription_id" text,
	"monthly_ai_budget_cents" integer DEFAULT 5000 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pairing_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"bucket" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "screenshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"agent_token_id" integer,
	"captured_at" timestamp with time zone NOT NULL,
	"storage_key" text,
	"storage_driver" text,
	"display_index" integer DEFAULT 0 NOT NULL,
	"mime" text DEFAULT 'image/jpeg' NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "scrum_coverage" (
	"id" serial PRIMARY KEY NOT NULL,
	"org_id" integer NOT NULL,
	"covered_user_id" integer NOT NULL,
	"day" date NOT NULL,
	"covered_by_user_id" integer NOT NULL,
	"covered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"org_id" integer,
	"punched_in_at" timestamp with time zone DEFAULT now() NOT NULL,
	"punched_in_via" text DEFAULT 'agent' NOT NULL,
	"punched_out_at" timestamp with time zone,
	"punched_out_via" text,
	"work_summary" text,
	"verification_status" text DEFAULT 'unverified' NOT NULL,
	"verification_score" integer,
	"verification_notes" text,
	"verification_provider" text,
	"verified_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "shot_analyses" (
	"id" serial PRIMARY KEY NOT NULL,
	"screenshot_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"work_app_label" text NOT NULL,
	"app_category" text NOT NULL,
	"visible_content_hint" text NOT NULL,
	"confidence" integer DEFAULT 0 NOT NULL,
	"progress_score" integer DEFAULT 0 NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"raw_json" jsonb,
	"analyzed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shot_analyses_screenshot_id_unique" UNIQUE("screenshot_id")
);
--> statement-breakpoint
CREATE TABLE "shot_consents" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"consented_at" timestamp with time zone DEFAULT now() NOT NULL,
	"agent_version" text,
	"policy_version" text NOT NULL,
	"ip" text
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"tracking_paused_at" timestamp with time zone,
	"window_titles_enabled" boolean DEFAULT false NOT NULL,
	"consent_at" timestamp with time zone,
	"consent_agent_version" text,
	"consent_policy_version" text,
	"sample_interval_seconds" integer DEFAULT 30 NOT NULL,
	"flush_interval_seconds" integer DEFAULT 300 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"github_id" integer,
	"login" text NOT NULL,
	"name" text,
	"email" text,
	"email_verified" timestamp with time zone,
	"avatar_url" text,
	"image" text,
	"access_token" text,
	"character_key" text,
	"last_synced_at" timestamp with time zone,
	"last_sync_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_github_id_unique" UNIQUE("github_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_token" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verification_token_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tokens" ADD CONSTRAINT "agent_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_spend" ADD CONSTRAINT "ai_spend_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_spend" ADD CONSTRAINT "ai_spend_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breaks" ADD CONSTRAINT "breaks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breaks" ADD CONSTRAINT "breaks_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breaks" ADD CONSTRAINT "breaks_waiting_on_user_id_users_id_fk" FOREIGN KEY ("waiting_on_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_states" ADD CONSTRAINT "daily_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_stories" ADD CONSTRAINT "daily_stories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_events" ADD CONSTRAINT "github_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_activity" ADD CONSTRAINT "local_activity_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_activity" ADD CONSTRAINT "local_activity_agent_token_id_agent_tokens_id_fk" FOREIGN KEY ("agent_token_id") REFERENCES "public"."agent_tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "narratives" ADD CONSTRAINT "narratives_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orgs" ADD CONSTRAINT "orgs_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pairing_codes" ADD CONSTRAINT "pairing_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screenshots" ADD CONSTRAINT "screenshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screenshots" ADD CONSTRAINT "screenshots_agent_token_id_agent_tokens_id_fk" FOREIGN KEY ("agent_token_id") REFERENCES "public"."agent_tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrum_coverage" ADD CONSTRAINT "scrum_coverage_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrum_coverage" ADD CONSTRAINT "scrum_coverage_covered_user_id_users_id_fk" FOREIGN KEY ("covered_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrum_coverage" ADD CONSTRAINT "scrum_coverage_covered_by_user_id_users_id_fk" FOREIGN KEY ("covered_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shot_analyses" ADD CONSTRAINT "shot_analyses_screenshot_id_screenshots_id_fk" FOREIGN KEY ("screenshot_id") REFERENCES "public"."screenshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shot_analyses" ADD CONSTRAINT "shot_analyses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shot_consents" ADD CONSTRAINT "shot_consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_tokens_user_idx" ON "agent_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_tokens_hash_idx" ON "agent_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "ai_spend_org_created_idx" ON "ai_spend" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_org_recent_idx" ON "audit_logs" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_action_idx" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "breaks_user_active_idx" ON "breaks" USING btree ("user_id","ended_at");--> statement-breakpoint
CREATE INDEX "breaks_org_recent_idx" ON "breaks" USING btree ("org_id","started_at");--> statement-breakpoint
CREATE INDEX "breaks_waiting_on_idx" ON "breaks" USING btree ("waiting_on_user_id","ended_at");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_states_user_day_idx" ON "daily_states" USING btree ("user_id","day");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_stories_user_day_idx" ON "daily_stories" USING btree ("user_id","day");--> statement-breakpoint
CREATE INDEX "github_events_user_occurred_idx" ON "github_events" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "github_events_external_idx" ON "github_events" USING btree ("user_id","type","external_id");--> statement-breakpoint
CREATE INDEX "holidays_org_date_idx" ON "holidays" USING btree ("org_id","date");--> statement-breakpoint
CREATE INDEX "holidays_region_date_idx" ON "holidays" USING btree ("region","date");--> statement-breakpoint
CREATE INDEX "invites_org_idx" ON "invites" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "invites_email_idx" ON "invites" USING btree ("email");--> statement-breakpoint
CREATE INDEX "leave_requests_org_status_idx" ON "leave_requests" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "leave_requests_user_idx" ON "leave_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "local_activity_user_start_idx" ON "local_activity" USING btree ("user_id","window_start");--> statement-breakpoint
CREATE UNIQUE INDEX "magic_links_hash_idx" ON "magic_links" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "magic_links_email_idx" ON "magic_links" USING btree ("email");--> statement-breakpoint
CREATE INDEX "meetings_user_start_idx" ON "meetings" USING btree ("user_id","start_at");--> statement-breakpoint
CREATE UNIQUE INDEX "meetings_external_idx" ON "meetings" USING btree ("user_id","provider","external_id");--> statement-breakpoint
CREATE INDEX "memberships_org_user_idx" ON "memberships" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "narratives_user_created_idx" ON "narratives" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_user_unread_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pairing_codes_hash_idx" ON "pairing_codes" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX "pairing_codes_user_idx" ON "pairing_codes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "rate_limit_bucket_occurred_idx" ON "rate_limit_events" USING btree ("bucket","occurred_at");--> statement-breakpoint
CREATE INDEX "screenshots_user_captured_idx" ON "screenshots" USING btree ("user_id","captured_at");--> statement-breakpoint
CREATE INDEX "screenshots_expires_idx" ON "screenshots" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "scrum_coverage_org_day_user_idx" ON "scrum_coverage" USING btree ("org_id","day","covered_user_id");--> statement-breakpoint
CREATE INDEX "shifts_user_active_idx" ON "shifts" USING btree ("user_id","punched_out_at");--> statement-breakpoint
CREATE INDEX "shifts_org_recent_idx" ON "shifts" USING btree ("org_id","punched_in_at");--> statement-breakpoint
CREATE UNIQUE INDEX "shifts_one_open_per_user_idx" ON "shifts" USING btree ("user_id") WHERE "shifts"."punched_out_at" IS NULL;--> statement-breakpoint
CREATE INDEX "shot_analyses_user_analyzed_idx" ON "shot_analyses" USING btree ("user_id","analyzed_at");