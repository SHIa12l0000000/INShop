export default function NotFound() {
  return (
    <main className="empty">
      <img width="70" src="/favicon.svg" alt="INShop" />
      <h1>Looks like this aisle doesn’t exist.</h1>
      <a className="button" href="/">
        Return home
      </a>
      <a href="/search">Search INShop</a>
    </main>
  );
}
