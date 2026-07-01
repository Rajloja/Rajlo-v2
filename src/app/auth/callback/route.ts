import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import {
  sendWelcomeRiderEmail,
  sendWelcomeDriverEmail,
} from "@/lib/email-templates";
import { isBrandNewUser, markWelcomeSent } from "@/lib/welcome-gate";

/**
 * Handles redirects from Supabase auth flows:
 *   - Email signup confirmation     (?code=...&next=/...)
 *   - Password recovery             (?code=...&next=/auth/reset-password)
 *   - Magic link                    (?code=...)
 *   - Google OAuth                  (?code=...&role_intent=rider|driver&next=/...)
 *
 * Exchanges the one-time code for a session cookie. For Google OAuth on a
 * brand-new user, also assigns the requested role (rider/driver) since the
 * default is 'rider' regardless of which page they signed up from.
 *
 * On failure (expired/missing/used code) bounces to the login page that best
 * matches where the user started — driver→driver login, rider→rider login,
 * admin→admin login — with a friendly error param.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "";
  const roleIntent = searchParams.get("role_intent");

  const loginUrl = (errorMsg: string) => {
    const base =
      roleIntent === "driver" || nextParam.startsWith("/driver")
        ? "/auth/driver/login"
        : nextParam.startsWith("/admin")
          ? "/auth/admin/login"
          : "/auth/rider/login";
    return `${origin}${base}?error=${encodeURIComponent(errorMsg)}`;
  };

  if (!code) {
    return NextResponse.redirect(loginUrl("link_expired"));
  }

  const supabase = await createSupabaseAuthServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(loginUrl(error?.message ?? "auth_failed"));
  }

  // Whether this OAuth handshake is a genuine first-time sign-up vs a
  // returning user. This decides how a role mismatch is handled:
  //   - brand-new  → assign the intended role (fresh signup)
  //   - returning  → REJECT a wrong-portal attempt (e.g. tapping
  //                  "Continue with Google" on the RIDER page with an
  //                  email that owns a DRIVER account). Otherwise the
  //                  rider sign-in would silently drop them into the
  //                  driver portal.
  const brandNew = isBrandNewUser(data.user);

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", data.user.id)
    .maybeSingle();
  let role = profile?.role ?? "rider";

  if (roleIntent === "driver" || roleIntent === "rider") {
    if (brandNew) {
      // Fresh Google signup — the DB trigger created the profile as the
      // default 'rider'. Promote to 'driver' if they signed up from the
      // driver page (rider intent needs no change). service_role so RLS
      // can't interfere.
      if (role === "rider" && roleIntent === "driver") {
        const admin = getSupabaseServerClient();
        if (admin) {
          await admin
            .from("profiles")
            .update({ role: "driver" })
            .eq("id", data.user.id);
          role = "driver";
        }
      }
    } else if (role !== roleIntent) {
      // Returning user signing in from the WRONG portal. Tear the
      // just-created session back down and bounce them to the portal
      // they tried, telling them which account this email actually
      // owns. `account_is_<role>` is mapped to copy by friendlyError().
      await supabase.auth.signOut();
      const base =
        roleIntent === "driver"
          ? "/auth/driver/login"
          : "/auth/rider/login";
      return NextResponse.redirect(
        `${origin}${base}?error=account_is_${role}`,
      );
    }
  }

  // A driver arriving here (OAuth sign-in, email confirmation, magic
  // link) is starting a fresh session — reset them OFFLINE so they
  // must explicitly go online before taking trips. Skipped when a trip
  // is in flight: a driver re-authenticating with a rider aboard must
  // stay online. Best-effort — never block the login on this.
  if (role === "driver") {
    const admin = getSupabaseServerClient();
    if (admin) {
      try {
        const { data: drv } = await admin
          .from("drivers")
          .select("id")
          .eq("user_id", data.user.id)
          .maybeSingle();
        if (drv) {
          const { count } = await admin
            .from("rides")
            .select("id", { count: "exact", head: true })
            .eq("driver_id", drv.id)
            .in("status", ["accepted", "arrived", "in_progress"]);
          if (!count) {
            await admin
              .from("drivers")
              .update({ is_online: false })
              .eq("id", drv.id);
          }
        }
      } catch {
        /* best-effort — a stale online flag is caught by the
           heartbeat sweep anyway */
      }
    }
  }

  // First-time welcome email — fires only when this is a genuine
  // brand-new sign-up. The `isBrandNewUser` helper combines two
  // signals: the `welcome_sent_at` flag in user_metadata AND a
  // created_at ≈ last_sign_in_at check. The second guard is what
  // catches users who signed up before the flag existed in the
  // codebase — without it they'd get a "welcome" every time they
  // re-logged in.
  if (isBrandNewUser(data.user)) {
    const admin = getSupabaseServerClient();
    void (async () => {
      try {
        // Mark the flag FIRST so a concurrent callback (e.g. user
        // double-clicked the magic link) sees it on read and skips.
        // Worst case if the email send then fails: we miss one welcome
        // — better than sending two.
        if (admin) {
          await markWelcomeSent(admin, data.user!);
        }
        if (role === "driver") {
          await sendWelcomeDriverEmail(data.user!.email!, {
            fullName: profile?.full_name ?? null,
          });
        } else {
          await sendWelcomeRiderEmail(data.user!.email!, {
            fullName: profile?.full_name ?? null,
          });
        }
      } catch {
        /* best-effort */
      }
    })();
  }

  // If a `next` was specified, only honor it when it matches the user's role.
  // A rider trying to land on /driver/* should be bounced to /rider instead.
  if (nextParam) {
    const nextMatchesRole =
      (role === "driver" && nextParam.startsWith("/driver")) ||
      (role === "rider" && nextParam.startsWith("/rider")) ||
      (role === "admin" && nextParam.startsWith("/admin")) ||
      // password reset is role-agnostic
      nextParam.startsWith("/auth/");
    if (nextMatchesRole) {
      return NextResponse.redirect(`${origin}${nextParam}`);
    }
  }

  // Otherwise route to the user's portal based on their profile role.
  const portal =
    role === "admin"
      ? "/admin"
      : role === "driver"
        ? "/driver"
        : "/rider";

  return NextResponse.redirect(`${origin}${portal}`);
}
