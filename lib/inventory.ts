import type { CommerceDB } from "./order-lifecycle.ts";
import { HttpError } from "./errors.ts";
export async function adjustStock(
  db: CommerceDB,
  id: string,
  stock: number,
  expectedStock: number,
  now = Date.now(),
) {
  const changed = await db.batch([
    db
      .prepare(
        "INSERT INTO inventory_transactions SELECT ?,id,NULL,?-stock,?,? FROM products WHERE id=? AND stock=?",
      )
      .bind(
        crypto.randomUUID(),
        stock,
        "Admin stock adjustment",
        now,
        id,
        expectedStock,
      ),
    db
      .prepare(
        "UPDATE products SET stock=?,updated_at=? WHERE id=? AND stock=? RETURNING id",
      )
      .bind(stock, now, id, expectedStock),
  ]);
  if (!changed[1].results.length)
    throw new HttpError(
      409,
      "Stock changed while you were editing. Reload inventory and check the current quantity.",
    );
}
