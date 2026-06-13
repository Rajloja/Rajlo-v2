import { redirect, notFound } from "next/navigation";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";

/**
 * /rider/route-taxi/history/journey/[id]
 *
 * The rider history listing links multi-leg route-taxi journeys here,
 * but the existing single-hail detail page at
 * `/rider/route-taxi/history/[hailId]` already knows how to render a
 * journey when given any leg's hail id (it auto-fetches the full
 * journey breakdown via /api/rider/route-taxi/journeys/[id] and shows
 * the per-leg fare panel).
 *
 * So instead of duplicating that whole detail page here, this thin
 * server component resolves the journey to its earliest hail and
 * 302s the rider there. The detail page handles the rest.
 *
 * Failure modes:
 *   - Not signed in → notFound() so we don't leak journey existence
 *     to an anonymous probe.
 *   - Journey not found or doesn't belong to this rider → notFound().
 *   - Journey exists but has no hails yet (race: rider opened the
 *     history link before any leg got dispatched) → notFound() with
 *     a fallback redirect to the history index.
 */
export default async function JourneyDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: journeyId } = await params;

  const auth = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) notFound();

  // Confirm the journey belongs to this rider before we resolve any
  // hail under it. The route_journeys table has rider_id; checking
  // here keeps the redirect from leaking ids across accounts.
  const { data: journey } = await auth
    .from("route_journeys")
    .select("id")
    .eq("id", journeyId)
    .eq("rider_id", user.id)
    .maybeSingle();
  if (!journey) notFound();

  // Earliest leg = lowest leg_order. We use this hail id as the
  // canonical entry point into the detail page; the page itself
  // surfaces the rest of the journey via its breakdown panel.
  const { data: firstHail } = await auth
    .from("route_hails")
    .select("id")
    .eq("journey_id", journeyId)
    .order("leg_order", { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (!firstHail) {
    // Race case — journey exists but no hails dispatched yet. Send
    // the rider back to the history index rather than 404; the
    // listing will refresh and they can try again.
    redirect("/rider/history");
  }

  redirect(`/rider/route-taxi/history/${firstHail.id}`);
}
