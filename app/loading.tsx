export default function Loading() {
  return (
    <main className="wrap" aria-busy="true" aria-label="Loading INShop">
      <div className="skeleton" style={{ height: 64, marginBottom: 24 }} />
      <div className="skeleton" style={{ height: 350 }} />
      <div className="products" style={{ marginTop: 24 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton" style={{ height: 270 }} />
        ))}
      </div>
    </main>
  );
}
