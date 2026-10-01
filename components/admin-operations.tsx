"use client";
import { useState } from "react";
import { api } from "./store-provider";
import { money } from "../lib/types";
export default function AdminOperations({
  section,
  row,
  onSaved,
}: {
  section: string;
  row: any;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const data = row.data ? JSON.parse(row.data) : {};
  async function action(path: string, body: unknown) {
    setBusy(true);
    setError("");
    try {
      await api("/api/admin/" + section + "/" + row.id + path, body);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const next: Record<string, string> = {
    placed: "processing",
    processing: "packed",
    packed: "shipped",
    shipped: "out-for-delivery",
    "out-for-delivery": "delivered",
  };
  return (
    <div className="operations-panel">
      <dl className="operation-facts">
        <dt>Reference</dt>
        <dd>{row.reference ?? row.order_reference ?? row.id}</dd>
        <dt>Status</dt>
        <dd>{row.status}</dd>
        {row.payment_status && (
          <>
            <dt>Payment</dt>
            <dd>{row.payment_status}</dd>
          </>
        )}
        {(row.total ?? row.amount) && (
          <>
            <dt>Amount</dt>
            <dd>{money(row.total ?? row.amount)}</dd>
          </>
        )}
      </dl>
      {section === "orders" && (
        <>
          <div>
            {data.items?.map((item: any) => (
              <p key={item.id}>
                {item.title} × {item.quantity} —{" "}
                {money(item.price * item.quantity)}
              </p>
            ))}
          </div>
          {data.address && (
            <p>
              {data.address.name}
              <br />
              {data.address.street}, {data.address.city} {data.address.pin}
            </p>
          )}
          {next[row.status] && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                action("", {
                  status: next[row.status],
                  tracking: String(f.get("tracking") ?? ""),
                  courier: String(f.get("courier") ?? ""),
                  cashCollected: f.get("cashCollected") === "on",
                });
              }}
            >
              <h3>Fulfillment</h3>
              {next[row.status] === "shipped" && (
                <>
                  <label>
                    Courier
                    <input name="courier" required maxLength={100} />
                  </label>
                  <label>
                    Tracking number
                    <input name="tracking" required maxLength={100} />
                  </label>
                </>
              )}
              {next[row.status] === "delivered" && row.method === "cod" && (
                <label className="checkbox">
                  <input type="checkbox" name="cashCollected" required />
                  The courier confirmed full payment was collected
                </label>
              )}
              <button className="button" disabled={busy}>
                Mark {next[row.status].replaceAll("-", " ")}
              </button>
            </form>
          )}
          {["placed", "processing"].includes(row.status) && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (
                  confirm(
                    "Cancel this order and release its stock? Captured online payments will need a refund.",
                  )
                )
                  action("", {
                    status: "cancelled",
                    reason: new FormData(e.currentTarget).get("reason"),
                  });
              }}
            >
              <label>
                Cancellation reason
                <input name="reason" required minLength={3} maxLength={300} />
              </label>
              <button className="button secondary" disabled={busy}>
                Cancel order
              </button>
            </form>
          )}
          <h3>Order history</h3>
          <ol>
            {data.history?.map((event: any, i: number) => (
              <li key={i}>
                {event.status.replaceAll("-", " ")} ·{" "}
                {new Date(event.at).toLocaleString("en-IN")}
                {event.note ? " · " + event.note : ""}
              </li>
            ))}
          </ol>
        </>
      )}
      {section === "returns" && (
        <>
          <p>{row.reason}</p>
          {row.status === "requested" && (
            <div className="row-actions">
              <button
                className="button"
                disabled={busy}
                onClick={() => action("", { status: "approved" })}
              >
                Approve return
              </button>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => action("", { status: "rejected" })}
              >
                Reject return
              </button>
            </div>
          )}
          {row.status === "approved" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (
                  confirm(
                    "Confirm the returned goods have been received and inspected?",
                  )
                )
                  action("", {
                    status: "received",
                    restock:
                      new FormData(e.currentTarget).get("restock") === "on",
                  });
              }}
            >
              <label className="checkbox">
                <input type="checkbox" name="restock" />
                Goods are resalable; return quantities to stock
              </label>
              <p className="subtext">
                Receiving this return creates a refund request for a collected
                payment. Review it in Refunds.
              </p>
              <button className="button" disabled={busy}>
                Confirm goods received
              </button>
            </form>
          )}
        </>
      )}
      {section === "refunds" &&
        row.method === "cod" &&
        row.status === "requested" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              action("/record-cod", {
                reference: f.get("reference"),
                confirmed: true,
              });
            }}
          >
            <h3>Record completed COD refund</h3>
            <p className="subtext">
              Complete the payout through your approved refund process first.
              This form records it; it does not transfer money.
            </p>
            <label>
              Payout reference
              <input name="reference" required minLength={5} maxLength={100} />
            </label>
            <label className="checkbox">
              <input type="checkbox" required />I verified the customer received
              the full refund
            </label>
            <button className="button" disabled={busy}>
              Record completed refund
            </button>
          </form>
        )}
      {section === "refunds" && row.method !== "cod" && (
        <>
          <p>
            Refund reference: {row.gateway_id ?? "Not submitted to gateway"}
          </p>
          {row.last_error && <p className="error-text">{row.last_error}</p>}
          <p className="subtext">
            Submission sends the full stored amount to the captured payment. An
            uncertain request always reuses the same refund key.
          </p>
          <div className="row-actions">
            {["requested", "uncertain", "submitting"].includes(row.status) && (
              <button
                className="button"
                disabled={busy}
                onClick={() => {
                  if (confirm("Submit this refund to the payment provider?"))
                    action("/submit", {});
                }}
              >
                Submit / retry refund
              </button>
            )}
            {row.gateway_id && row.status !== "processed" && (
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => action("/reconcile", {})}
              >
                Check provider status
              </button>
            )}
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      {busy && <p role="status">Saving…</p>}
    </div>
  );
}
