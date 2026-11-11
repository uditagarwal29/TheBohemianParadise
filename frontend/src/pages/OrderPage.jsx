import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api, money } from "../api";
import { useStore } from "../store";
import { Alert, Empty, STATUS_LABEL, Spinner, formatAddress, useAsync } from "../components/ui";
import { Icon } from "../components/Layout";
import { contact } from "../data";

const STEPS = ["pending_payment", "paid", "processing", "shipped", "delivered"];

function Timeline({ status }) {
  const idx = STEPS.indexOf(status);
  const dead = ["cancelled", "payment_failed", "refunded"].includes(status);
  return (
    <ol className={`timeline ${dead ? "timeline--dead" : ""}`}>
      {STEPS.map((s, k) => (
        <li key={s} className={k < idx ? "is-done" : k === idx ? "is-current" : ""}>
          <span className="timeline__dot">{k < idx && <Icon.check />}</span>
          <span>{STATUS_LABEL[s]}</span>
        </li>
      ))}
    </ol>
  );
}

export default function OrderPage() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const { notify } = useStore();
  const [order, setOrder] = useState(null);
  const [status, setStatus] = useState("loading");
  const [reference, setReference] = useState("");
  const { busy, error, run } = useAsync();

  const load = () => api.orders.one(id).then(({ order }) => { setOrder(order); setStatus("ok"); }).catch((e) => setStatus(e.status === 404 ? "missing" : "error"));

  useEffect(() => {
    load();
    // After a Stripe redirect the webhook may land a second later; poll briefly.
    if (sp.get("paid")) {
      let n = 0;
      const t = setInterval(() => {
        n += 1;
        load();
        if (n >= 10) clearInterval(t);
      }, 2000);
      return () => clearInterval(t);
    }
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (status === "loading") return <Spinner />;
  if (status === "missing") return <Empty title="Order not found"><Link to="/orders" className="btn btn--ghost">Your orders</Link></Empty>;
  if (status === "error") return <Empty title="Couldn't load this order" />;

  const unpaid = order.status === "pending_payment";
  const manual = order.payment.method === "manual";

  const cancel = async () => {
    if (!window.confirm("Cancel this order? The pieces go back on sale.")) return;
    try {
      const { order: o } = await run(() => api.orders.cancel(order._id));
      setOrder(o);
      notify("Order cancelled");
    } catch {}
  };

  const sendReference = async (e) => {
    e.preventDefault();
    try {
      const { order: o } = await run(() => api.orders.paymentReference(order._id, reference));
      setOrder(o);
      notify("Thanks, we'll confirm your payment shortly", "success");
    } catch {}
  };

  return (
    <section className="section order">
      <nav className="crumbs"><Link to="/orders">Orders</Link><span>/</span><span>{order.orderNumber}</span></nav>
      {sp.get("placed") && unpaid && <Alert kind="success">Order placed. {manual ? "Complete the payment below to confirm it." : ""}</Alert>}
      {sp.get("paid") && unpaid && <Alert kind="info">Waiting for the payment confirmation from Stripe…</Alert>}
      {order.status === "paid" && sp.get("paid") && <Alert kind="success">Payment received. Thank you!</Alert>}

      <header className="order__head">
        <div>
          <h1>Order {order.orderNumber}</h1>
          <p className="muted">Placed {new Date(order.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>
        </div>
        <span className={`status status--${order.status}`}>{STATUS_LABEL[order.status]}</span>
      </header>

      <Timeline status={order.status} />

      {unpaid && manual && (
        <div className="panel pay-manual">
          <h2>How to pay {money(order.total)}</h2>
          <p>Transfer to the seller by UPI or bank transfer, then paste the transaction reference here. Your pieces are held until <strong>{new Date(order.reservedUntil).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</strong>.</p>
          <p className="muted small">Need the UPI ID or account details? Call or WhatsApp {contact.phone} or email {contact.email} quoting <strong>{order.orderNumber}</strong>.</p>
          {order.payment.reference ? (
            <Alert kind="info">Reference <strong>{order.payment.reference}</strong> received. The seller will confirm it soon.</Alert>
          ) : (
            <form onSubmit={sendReference} className="inline-form">
              <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UPI / transaction reference" minLength={4} required />
              <button className="btn btn--primary" disabled={busy}>Submit</button>
            </form>
          )}
          {error && <Alert kind="error">{error.message}</Alert>}
        </div>
      )}

      {order.status === "payment_failed" && <Alert kind="warn">This order wasn't paid in time, so the pieces went back on sale. <Link to="/products?inStock=1">See what's still available</Link>.</Alert>}
      {order.tracking?.number && (
        <Alert kind="info">Shipped via {order.tracking.carrier || "courier"}, tracking <strong>{order.tracking.number}</strong>{order.tracking.url && <> · <a href={order.tracking.url} target="_blank" rel="noreferrer">Track</a></>}</Alert>
      )}

      <div className="order__grid">
        <ul className="cart__lines">
          {order.items.map((i, k) => (
            <li className="line" key={k}>
              <Link to={`/product/${i.productId}`} className="line__media">{i.image ? <img src={i.image} alt="" /> : <div className="card__placeholder" />}</Link>
              <div className="line__body">
                <Link to={`/product/${i.productId}`} className="line__title">{i.title}</Link>
                {i.size && <div className="muted">Size {i.size}</div>}
                <div className="muted">{i.qty} × {money(i.unitPrice)}</div>
              </div>
              <div className="line__total">{money(i.unitPrice * i.qty)}</div>
            </li>
          ))}
        </ul>
        <aside className="summary">
          <h2>Summary</h2>
          <dl>
            <dt>Subtotal</dt><dd>{money(order.subtotal)}</dd>
            <dt>Shipping</dt><dd>{order.shipping === 0 ? "Free" : money(order.shipping)}</dd>
            <dt className="summary__total">Total</dt><dd className="summary__total">{money(order.total)}</dd>
          </dl>
          <h3>Deliver to</h3>
          <p className="small">{formatAddress(order.shippingAddress)}</p>
          {order.customerNote && <><h3>Your note</h3><p className="small">{order.customerNote}</p></>}
          <h3>Payment</h3>
          <p className="small">{manual ? "UPI / bank transfer" : "Card via Stripe"}{order.payment.paidAt ? ` · paid ${new Date(order.payment.paidAt).toLocaleDateString("en-IN")}` : ""}</p>
          {unpaid && <button className="link danger" onClick={cancel} disabled={busy}>Cancel order</button>}
        </aside>
      </div>
    </section>
  );
}
