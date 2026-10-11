import {
  authClient,
  requireUser,
  siteAuthConfigured,
  authConfigured,
  googleAuthConfigured,
  emailDeliveryConfigured,
  authDestination,
  clearSiteSession,
  clearSupabaseCookies,
} from "../../../../lib/auth";
import { cookies } from "next/headers";
import { getChatGPTUser, chatGPTSignInPath } from "../../../chatgpt-auth";
import { config, initialize } from "../../../../lib/database";
import {
  sameOrigin,
  rateLimit,
  jsonBody,
  errorResponse,
  HttpError,
} from "../../../../lib/security";
import { z } from "zod";
import { normalizeTotpQr } from "../../../../lib/mfa";
export async function POST(
  req: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  try {
    sameOrigin(req);
    await initialize();
    await rateLimit(req, "auth", 8);
    const { action } = await params;
    if (action === "logout") {
      await clearSiteSession();
      try {
        if (authConfigured()) {
          const client = await authClient();
          await client.auth.signOut({ scope: "local" });
        }
      } finally {
        await clearSupabaseCookies();
      }
      return Response.json({ ok: true });
    }
    if (action === "factors") {
      const user = await requireUser();
      if (user.provider !== "supabase")
        throw new HttpError(
          403,
          "Use your INShop email and password for administrator verification.",
        );
      const client = await authClient();
      const { data, error } = await client.auth.mfa.listFactors();
      if (error)
        throw new HttpError(400, "Unable to load verification methods.");
      const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
      return Response.json({
        adminReady:
          user.role === "admin" &&
          !assurance.error &&
          assurance.data?.currentLevel === "aal2",
        factors: data.totp
          .filter((f) => f.status === "verified")
          .map((f) => ({ id: f.id, name: f.friendly_name || "Authenticator" })),
      });
    }
    const b = await jsonBody(req);
    const client = await authClient();
    let result;
    if (action === "login") {
      const v = z
        .object({ email: z.string().email(), password: z.string().min(1) })
        .parse(b);
      result = await client.auth.signInWithPassword(v);
    } else if (action === "register") {
      if (!emailDeliveryConfigured())
        throw new HttpError(
          503,
          "Email registration is temporarily unavailable. Please use another available sign-in method.",
        );
      const v = z
        .object({
          email: z.string().email(),
          password: z
            .string()
            .min(8)
            .regex(/[A-Z]/)
            .regex(/[a-z]/)
            .regex(/\d/)
            .regex(/[^a-zA-Z0-9]/),
          name: z.string().min(2).max(100),
          phone: z.string().regex(/^[6-9]\d{9}$/),
          agree: z.literal(true),
        })
        .parse(b);
      result = await client.auth.signUp({
        email: v.email,
        password: v.password,
        options: {
          data: { full_name: v.name, phone: v.phone },
          emailRedirectTo: config("APP_URL") + "/auth/callback",
        },
      });
    } else if (action === "forgot-password") {
      if (!emailDeliveryConfigured())
        throw new HttpError(
          503,
          "Password reset emails are temporarily unavailable. Please contact support.",
        );
      const v = z.object({ email: z.string().email() }).parse(b);
      result = await client.auth.resetPasswordForEmail(v.email, {
        redirectTo: config("APP_URL") + "/auth/callback?next=/account/security",
      });
    } else if (action === "password") {
      const v = z
        .object({
          password: z
            .string()
            .min(8)
            .regex(/[A-Z]/)
            .regex(/[a-z]/)
            .regex(/\d/)
            .regex(/[^a-zA-Z0-9]/),
        })
        .parse(b);
      result = await client.auth.updateUser({ password: v.password });
    } else if (action === "otp") {
      const v = z
        .object({ phone: z.string().regex(/^\+91[6-9]\d{9}$/) })
        .parse(b);
      result = await client.auth.signInWithOtp({ phone: v.phone });
    } else if (action === "verify") {
      const v = z
        .object({ phone: z.string(), token: z.string().regex(/^\d{6}$/) })
        .parse(b);
      result = await client.auth.verifyOtp({ ...v, type: "sms" });
    } else if (action === "mfa-enroll") {
      const user = await requireUser();
      if (user.provider !== "supabase")
        throw new HttpError(
          403,
          "Sign in with your INShop email and password to set up an authenticator.",
        );
      const existing = await client.auth.mfa.listFactors();
      if (existing.error)
        throw new HttpError(
          400,
          "Unable to check authenticator setup. Please retry.",
        );
      if (existing.data.totp.some((factor) => factor.status === "verified"))
        throw new HttpError(
          409,
          "An authenticator is already enabled. Select Already set up to enter its current code.",
        );
      // Only replace this app's abandoned, unverified setup. Never remove an
      // active factor or a factor created by another application.
      for (const factor of existing.data.all) {
        if (
          factor.factor_type === "totp" &&
          factor.status === "unverified" &&
          factor.friendly_name === "INShop authenticator"
        ) {
          const removed = await client.auth.mfa.unenroll({
            factorId: factor.id,
          });
          if (removed.error)
            throw new HttpError(
              400,
              "Unable to restart unfinished setup. Please retry.",
            );
        }
      }
      result = await client.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "INShop authenticator",
        issuer: "INShop",
      });
      if (result.error) throw new HttpError(400, result.error.message);
      return Response.json(
        {
          id: result.data.id,
          totp: {
            secret: result.data.totp.secret,
            qr_code: normalizeTotpQr(result.data.totp.qr_code),
          },
        },
        {
          headers: { "Cache-Control": "no-store, private", Pragma: "no-cache" },
        },
      );
    } else if (action === "mfa-verify") {
      const v = z
        .object({
          factorId: z.string().uuid(),
          code: z.string().regex(/^\d{6}$/),
        })
        .parse(b);
      result = await client.auth.mfa.challengeAndVerify(v);
    } else throw new HttpError(404, "Action not found");
    if (result.error)
      throw new HttpError(
        400,
        action === "login"
          ? "Email or password is incorrect, or your email has not been verified."
          : result.error.message,
      );
    if (
      ["login", "register", "verify"].includes(action) &&
      "session" in result.data &&
      result.data.session
    )
      await clearSiteSession();
    return Response.json({
      ok: true,
      message:
        action === "register"
          ? "Check your email to verify your account."
          : action === "forgot-password"
            ? "If an account exists, a reset email is on its way."
            : "Done",
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function GET(
  req: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  try {
    const { action } = await params;
    if (action === "site") {
      if (!siteAuthConfigured())
        throw new HttpError(503, "Site sign-in is unavailable.");
      const identity = await getChatGPTUser();
      if (!identity)
        return Response.redirect(
          new URL(chatGPTSignInPath("/api/auth/site"), req.url),
          302,
        );
      if (authConfigured()) {
        const client = await authClient();
        try {
          await client.auth.signOut({ scope: "local" });
        } finally {
          await clearSupabaseCookies();
        }
      }
      (await cookies()).set("inshop-site-session", "1", {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 604800,
      });
      return Response.redirect(new URL("/account", req.url), 302);
    }
    if (action !== "google") throw new HttpError(404, "Not found");
    if (!googleAuthConfigured())
      throw new HttpError(503, "Google sign-in is temporarily unavailable.");
    await rateLimit(req, "oauth", 10);
    const client = await authClient();
    const next = authDestination(new URL(req.url).searchParams.get("next"));
    const { data, error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: {
        scopes: "openid email profile",
        redirectTo:
          config("APP_URL") +
          "/auth/callback" +
          (next === "/account" ? "" : "?next=" + next),
      },
    });
    if (error || !data.url)
      throw new HttpError(400, "Google sign-in could not be started.");
    return Response.redirect(data.url, 302);
  } catch (e) {
    return errorResponse(e);
  }
}
