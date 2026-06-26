import { redirect } from "next/navigation";

/**
 * The company/manager landing now lives at the root (`/`) — Marina is
 * company-first. `/company` is kept as a permanent redirect so older links,
 * shares, and bookmarks still resolve.
 */
export default function CompanyLandingMoved() {
  redirect("/");
}
