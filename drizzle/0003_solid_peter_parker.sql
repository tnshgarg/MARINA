ALTER TABLE "memberships" ADD COLUMN "slack_user_id" text;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "slack_resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "slack_team_id" text;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "slack_team_name" text;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "slack_bot_token" text;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "slack_bot_user_id" text;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "slack_default_channel_id" text;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "slack_installed_at" timestamp with time zone;