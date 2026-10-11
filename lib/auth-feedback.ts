// Only display messages we control; provider error text may contain details
// that should never be reflected in URLs or rendered to customers.
export function authFeedback(code: string | null): string {
  if (code === "cancelled")
    return "Google sign-in was cancelled. Choose Continue with Google to try again, or use another sign-in method.";
  if (code === "verification")
    return "Sign-in could not be completed. The link may have expired or opened in a different browser. Please start sign-in again in this browser.";
  return "";
}
