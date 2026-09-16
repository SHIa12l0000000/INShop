"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="empty">
      <h2>Something didn’t load correctly.</h2>
      <button className="button" onClick={reset}>
        Try again
      </button>
      <a href="/">Return home</a>
    </main>
  );
}
