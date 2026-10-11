"use client";
import { useState } from "react";
import { api } from "./store-provider";

type Enrollment = { id: string; totp: { qr_code: string; secret: string } };

export default function AuthenticatorSetup({ email }: { email: string }) {
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [verified, setVerified] = useState(false);
  const [copied, setCopied] = useState(false);
  const [qrFailed, setQrFailed] = useState(false);
  return (
    <section
      className="authenticator-setup"
      aria-labelledby="authenticator-heading"
    >
      <h3 id="authenticator-heading">Two-factor authentication</h3>
      {verified ? (
        <div role="status">
          <p>Authenticator verified. Your account is protected.</p>
          <a className="button gold space-top" href="/admin">
            Continue to admin dashboard
          </a>
        </div>
      ) : enrollment ? (
        <>
          <p>
            In Google Authenticator, tap + and scan this QR code. Keep this page
            open until verification is complete.
          </p>
          {!!enrollment.totp.qr_code && !qrFailed ? (
            <div className="authenticator-qr">
              <img
                src={enrollment.totp.qr_code}
                width={256}
                height={256}
                alt="Scan this INShop setup QR code with Google Authenticator"
                onError={() => setQrFailed(true)}
              />
            </div>
          ) : (
            <p role="status">Use the manual setup key below instead.</p>
          )}
          <details
            className="authenticator-manual"
            open={qrFailed || undefined}
          >
            <summary>Can’t scan? Enter a setup key instead</summary>
            <p>
              In Google Authenticator, choose Enter a setup key. Use the account
              name below, paste the key, and select Time based.
            </p>
            <label>
              Account name
              <input readOnly value={`INShop (${email})`} />
            </label>
            <label>
              Setup key
              <input
                className="authenticator-secret"
                readOnly
                value={enrollment.totp.secret}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <button
              type="button"
              className="button secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(enrollment.totp.secret);
                  setCopied(true);
                } catch {
                  setError("Select the setup key and copy it manually.");
                }
              }}
            >
              {copied ? "Key copied" : "Copy setup key"}
            </button>
            <p className="subtext">
              Keep this key private. Use the newest INShop entry if you started
              setup before.
            </p>
          </details>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const code = String(
                new FormData(event.currentTarget).get("code") ?? "",
              ).replace(/\s/g, "");
              setBusy(true);
              setError("");
              try {
                await api("/api/auth/mfa-verify", {
                  factorId: enrollment.id,
                  code,
                });
                setEnrollment(null);
                setVerified(true);
              } catch (e) {
                setError(
                  (e as Error).message +
                    " Use the current six-digit code for the newest INShop entry and turn on automatic date and time on your phone.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Six-digit authenticator code
              <input
                name="code"
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9 ]{6,7}"
                maxLength={7}
                placeholder="000000"
              />
            </label>
            <button className="button gold" disabled={busy}>
              {busy ? "Verifying…" : "Verify & enable"}
            </button>
          </form>
        </>
      ) : (
        <>
          <p className="subtext">
            Google Authenticator and Microsoft Authenticator are supported. You
            can scan a QR code or enter a setup key manually.
          </p>
          <button
            className="button secondary space-top"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              setCopied(false);
              setQrFailed(false);
              try {
                setEnrollment(await api("/api/auth/mfa-enroll", {}));
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Preparing setup…" : "Set up authenticator"}
          </button>
          <a className="text-link space-top" href="/admin/login">
            Already set up? Verify your authenticator
          </a>
        </>
      )}
      {error && (
        <p className="error-text space-top" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
