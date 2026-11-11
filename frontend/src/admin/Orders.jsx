import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api, money } from "../api";
import { useStore } from "../store";
import { Alert, Field, STATUS_LABEL, Spinner, formatAddress, useAsync } from "../components/ui";

const STATUSES = ["", "pending_payment", "paid", "processing", "shipped", "delivered", "cancelled", "payment_failed", "refunded"];
const NEXT = {
  pending_payment: ["paid", "cancelled"],
  paid: ["processing", "shipped", "refunded", "cancelled"],
  processing: ["shipped", "refunded", "cancelled"],
  shipped: ["delivered", "refunded"],
  delivered: ["refunded"],
};

export function OrdersList() {
  const [sp, setSp] = useSearchParams();
  const [data, setData] = useState(null);
  const [q, setQ] = useState(sp.get("q") || "");
  const status = sp.get("status") || "";
  const page = parseInt(sp.get("page") || "1", 10);

  useEffect(() => {
    setData(null);
    api.admin.orders({ status, q: sp.get("q") || "", page, limit: 30 }).then(setData);
  }, [status, sp.get("q"), page]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (patch) => {
    const next = new URLSearchParams(sp);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    if (!("page" in patch)) next.delete("page");
    setSp(next);
  };

  return (
    <>
      <header className="admin__head"><h1>Orders</h1></header>
      <div className="admin__bar">
        <select value={status} onChange={(e) => update({ status: e.target.value })}>
          {STATUSES.map((s) => <option key={s} value={s}>{s ? STATUS_LABEL[s] : "All statuses"}</option>)}
        </select>
        <form onSubmit={(e) => { e.preventDefault(); update({ q }); }} className="inline-form">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Order number or customer name" />
          <button className="btn btn--ghost">Search</button>
        </form>
      </div>
      {!data ? <Spinner /> : (
        <>
          <table className="table">
            <thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Payment</th><th>Status</th><th className="num">Total</th><th>Placed</th></tr></thead>
            <tbody>
              {data.orders.map((o) => (
                <tr key={o._id}>
                  <td><Link to={`/admin/orders/${o._id}`}><strong>{o.orderNumber}</strong></Link></td>
                  <td>{o.userId?.name || o.shippingAddress.fullName}<br /><span className="muted small">{o.userId?.email}</span></td>
                  <td className="small">{o.items.map((i) => `${i.qty}× ${i.title}${i.size ? ` (${i.size})` : ""}`).join(", ")}</td>
                  <td className="small">{o.payment.method === "manual" ? "UPI/bank" : "Stripe"}{o.payment.reference && <><br /><span className="muted">ref {o.payment.reference}</span></>}</td>
                  <td><span className={`status status--${o.status}`}>{STATUS_LABEL[o.status]}</span></td>
                  <td className="num">{money(o.total)}</td>
                  <td className="muted small">{new Date(o.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</td>
                </tr>
              ))}
              {data.orders.length === 0 && <tr><td colSpan="7" className="muted" style={{ textAlign: "center", padding: 30 }}>No orders match.</td></tr>}
            </tbody>
          </table>
          {data.pages > 1 && (
            <nav className="pager">
              <button disabled={page <= 1} onClick={() => update({ page: String(page - 1) })}>Previous</button>
              <span>Page {page} of {data.pages} · {data.total} orders</span>
              <button disabled={page >= data.pages} onClick={() => update({ page: String(page + 1) })}>Next</button>
            </nav>
          )}
        </>
      )}
    </>
  );
}

export function OrderDetail() {
  const { id } = useParams();
  const { notify } = useStore();
  const [order, setOrder] = useState(null);
  const [status, setStatus] = useState("");
  const [note, setNote] = useState("");
  const [tracking, setTracking] = useState({ carrier: "", number: "", url: "" });
  const { busy, error, run } = useAsync();

  useEffect(() => {
    api.admin.order(id).then(({ order }) => { setOrder(order); setTracking({ carrier: "", number: "", url: "", ...order.tracking }); setStatus(NEXT[order.status]?.[0] || ""); });
  }, [id]);

  if (!order) return <Spinner />;
  const options = NEXT[order.status] || [];

  const apply = async (e) => {
    e.preventDefault();
    try {
      const body = { status, note: note || undefined };
      if (status === "shipped" && tracking.number) body.tracking = { carrier: tracking.carrier || undefined, number: tracking.number, url: tracking.url || undefined };
      const { order: o } = await run(() => api.admin.setOrderStatus(id, body));
      setOrder(o);
      setNote("");
      setStatus(NEXT[o.status]?.[0] || "");
      notify(`Order marked ${STATUS_LABEL[o.status].toLowerCase()}`, "success");
    } catch {}
  };

  return (
    <>
      <header className="admin__head">
        <div>
          <Link to="/admin/orders" className="muted small">← Orders</Link>
          <h1>{order.orderNumber}</h1>
        </div>
        <span className={`status status--${order.status}`}>{STATUS_LABEL[order.status]}</span>
      </header>

      <div className="admin__grid admin__grid--2">
        <section className="panel">
          <h2>Items</h2>
          <ul className="cart__lines">
            {order.items.map((i, k) => (
              <li className="line" key={k}>
                <span className="line__media">{i.image ? <img src={i.image} alt="" /> : <span className="card__placeholder" />}</span>
                <div className="line__body"><Link to={`/admin/products/${i.productId}`} className="line__title">{i.title}</Link>{i.size && <div className="muted">Size {i.size}</div>}<div className="muted">{i.qty} × {money(i.unitPrice)}</div></div>
                <div className="line__total">{money(i.unitPrice * i.qty)}</div>
              </li>
            ))}
          </ul>
          <dl className="summary__dl">
            <dt>Subtotal</dt><dd>{money(order.subtotal)}</dd>
            <dt>Shipping</dt><dd>{order.shipping ? money(order.shipping) : "Free"}</dd>
            <dt><strong>Total</strong></dt><dd><strong>{money(order.total)}</strong></dd>
          </dl>
        </section>

        <div className="admin__stack">
          <section className="panel">
            <h2>Customer</h2>
            <p>{order.userId?.name} · <a href={`mailto:${order.userId?.email}`}>{order.userId?.email}</a></p>
            <h3>Ship to</h3>
            <p className="small">{formatAddress(order.shippingAddress)}</p>
            {order.customerNote && <><h3>Customer note</h3><p className="small">{order.customerNote}</p></>}
            <h3>Payment</h3>
            <p className="small">
              {order.payment.method === "manual" ? "UPI / bank transfer" : "Stripe"}
              {order.payment.reference && <> · reference <strong>{order.payment.reference}</strong></>}
              {order.payment.paidAt && <> · paid {new Date(order.payment.paidAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</>}
              {order.status === "pending_payment" && <> · stock held until {new Date(order.reservedUntil).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</>}
            </p>
            {order.tracking?.number && <p className="small">Tracking: {order.tracking.carrier} {order.tracking.number}</p>}
          </section>

          {options.length > 0 && (
            <form className="panel" onSubmit={apply}>
              <h2>Update status</h2>
              {error && <Alert kind="error">{error.message}</Alert>}
              <div className="radios">
                {options.map((s) => (
                  <label key={s} className={`radio ${status === s ? "is-active" : ""}`}><input type="radio" name="st" checked={status === s} onChange={() => setStatus(s)} /><span>{STATUS_LABEL[s]}{s === "paid" && " (I received the money)"}{(s === "cancelled" || s === "refunded") && " (returns stock to the shop)"}</span></label>
                ))}
              </div>
              {status === "shipped" && (
                <div className="address-form__row">
                  <Field label="Courier"><input value={tracking.carrier} onChange={(e) => setTracking({ ...tracking, carrier: e.target.value })} placeholder="DTDC" /></Field>
                  <Field label="Tracking number"><input value={tracking.number} onChange={(e) => setTracking({ ...tracking, number: e.target.value })} /></Field>
                  <Field label="Tracking URL"><input value={tracking.url} onChange={(e) => setTracking({ ...tracking, url: e.target.value })} placeholder="https://" /></Field>
                </div>
              )}
              <Field label="Note (visible in history)"><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} /></Field>
              <button className="btn btn--primary" disabled={busy || !status}>{busy ? "Saving…" : `Mark as ${STATUS_LABEL[status] || "…"}`}</button>
            </form>
          )}

          <section className="panel">
            <h2>History</h2>
            <ul className="history">
              {[...order.history].reverse().map((h, k) => (
                <li key={k}><span className={`status status--${h.status}`}>{STATUS_LABEL[h.status]}</span><span className="muted small">{new Date(h.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} · {h.by}{h.note ? ` · ${h.note}` : ""}</span></li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
