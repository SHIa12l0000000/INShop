"use client";
import { useState } from "react";
import { Eye, EyeOff, ShieldCheck, ArrowRight } from "lucide-react";
import { api, useStore } from "./store-provider";
export default function AuthForm({
  mode = "login",
  skip,
  admin = false,
}: {
  mode?: string;
  skip?: () => void;
  admin?: boolean;
}) {
  const s = useStore();
  const [show, setShow] = useState(false),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const register = mode === "register",
    forgot = mode === "forgot-password",
    verify = mode === "verify";
  const strength = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[a-z]/.test(password),
    /\d/.test(password),
    /[^a-zA-Z0-9]/.test(password),
  ].filter(Boolean).length;
  return (
    <div className="auth-form">
      <a className="logo" href="/">
        <img src="/favicon.svg" alt="" width="36" />
        INShop{admin ? " Admin" : ""}
      </a>
      <h1>
        {admin
          ? "Welcome back, admin"
          : register
            ? "Make yourself at home."
            : forgot
              ? "Forgot your password?"
              : verify
                ? "Verify your account"
                : "Welcome to INShop"}
      </h1>
      <p className="subtext">
        {register
          ? "A world of good finds, with an account that’s all yours."
          : forgot
            ? "We’ll send a secure password reset link to your email."
            : verify
              ? "Check your inbox for an email verification link."
              : "Sign in for a personalized shopping experience."}
      </p>
      {!admin && s.siteAuthReady && (
        <>
          <a className="button" href="/api/auth/site" target="_top">
            Continue with ChatGPT
          </a>
          <p className="subtext">
            Use your verified site account to save your profile, wishlist and
            addresses.
          </p>
        </>
      )}
      {!s.authReady && !s.loading && (
        <div className="setup-note">
          Google and email sign-in need to be connected by the store owner.
          {admin
            ? " Administrator sign-in also requires two-factor authentication."
            : s.siteAuthReady
              ? " You can use your ChatGPT account above."
              : " You can browse as a guest."}
        </div>
      )}
      {!forgot && !verify && (
        <>
          <a
            className={"google-button " + (!s.authReady ? "disabled-link" : "")}
            href={s.authReady ? "/api/auth/google" : undefined}
            aria-disabled={!s.authReady}
          >
            <b>G</b> Continue with Google
          </a>
          <div className="divider">
            <span>or</span>
          </div>
        </>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setMessage("");
          const f = new FormData(e.currentTarget);
          if (register && f.get("confirm") !== password) {
            setError("Passwords do not match.");
            return;
          }
          setBusy(true);
          try {
            const result = await api(
              "/api/auth/" + (verify ? "verify" : mode),
              {
                email: f.get("email"),
                password,
                name: f.get("name"),
                phone: f.get("phone"),
                agree: f.get("agree") === "on",
                token: f.get("token"),
              },
            );
            if (mode === "login") {
              localStorage.setItem("inshop-auth-choice", "signed-in");
              location.href = admin ? "/admin/login?verify=1" : "/account";
            } else setMessage(result.message);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {register && (
          <>
            <label>
              Full name
              <input name="name" required autoComplete="name" minLength={2} />
            </label>
            <label>
              Mobile number
              <input
                name="phone"
                required
                inputMode="tel"
                autoComplete="tel-national"
                pattern="[6-9][0-9]{9}"
                maxLength={10}
                placeholder="10-digit mobile number"
              />
            </label>
          </>
        )}
        {!verify ? (
          <label>
            Email address
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
            />
          </label>
        ) : (
          <>
            <label>
              Phone
              <input name="phone" type="tel" placeholder="+91…" required />
            </label>
            <label>
              Verification code
              <input
                name="token"
                required
                pattern="[0-9]{6}"
                inputMode="numeric"
              />
            </label>
          </>
        )}
        {!forgot && !verify && (
          <>
            <label>
              Password
              <div className="password-field">
                <input
                  name="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type={show ? "text" : "password"}
                  required
                  minLength={register ? 8 : 1}
                  autoComplete={register ? "new-password" : "current-password"}
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  aria-label={show ? "Hide password" : "Show password"}
                  onClick={() => setShow(!show)}
                >
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>
            {register && (
              <>
                <div className="password-strength">
                  <i
                    style={{
                      width: (strength / 5) * 100 + "%",
                      background: strength === 5 ? "#2e795c" : "#df9b33",
                    }}
                  />
                </div>
                <p className="subtext">
                  8+ characters, uppercase, lowercase, a number and a symbol.
                </p>
                <label>
                  Confirm password
                  <input
                    name="confirm"
                    type={show ? "text" : "password"}
                    required
                    autoComplete="new-password"
                  />
                </label>
                <label className="checkbox">
                  <input type="checkbox" name="agree" required />{" "}
                  <span>
                    I agree to INShop’s <a href="/terms">Terms of Use</a> and{" "}
                    <a href="/privacy-policy">Privacy Policy</a>.
                  </span>
                </label>
              </>
            )}
          </>
        )}
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="success-message" role="status">
            {message}
          </p>
        )}
        <button className="button gold full" disabled={busy || !s.authReady}>
          {busy
            ? "Please wait…"
            : register
              ? "Create account"
              : forgot
                ? "Send reset link"
                : verify
                  ? "Verify"
                  : "Sign in"}{" "}
          <ArrowRight size={16} />
        </button>
      </form>
      <div className="auth-links">
        {register ? (
          <a href="/login">Already have an account? Sign in</a>
        ) : (
          <>
            <a href="/register">Create account</a>
            <a href="/forgot-password">Forgot password?</a>
          </>
        )}
      </div>
      {!admin && (
        <>
          <button
            className="skip-auth"
            onClick={() => {
              localStorage.setItem("inshop-auth-choice", "guest");
              if (skip) skip();
              else location.href = "/";
            }}
          >
            Skip for now
          </button>
          <p className="auth-footnote">
            You can browse INShop without signing in. We’ll ask you to sign in
            when you place an order or use account features.
          </p>
        </>
      )}
      <div className="trust-line">
        <ShieldCheck size={15} />
        Your account. Your privacy. Your choice.
      </div>
    </div>
  );
}
