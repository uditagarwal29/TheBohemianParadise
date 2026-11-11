import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, money } from "../api";
import { Empty, STATUS_LABEL, Spinner } from "../components/ui";

export default function Orders() {
  const [orders, setOrders] = useState(null);
  useEffect(() => {
    api.orders.mine().then((r) => setOrders(r.orders)).catch(() => setOrders([]));
  }, []);
  if (orders === null) return <Spinner />;
  if (orders.length === 0) {
    return (
      <Empty title="No orders yet">
        <Link to="/products?inStock=1" className="btn btn--primary">Find your first piece</Link>
      </Empty>
    );
  }
  return (
    <section className="section">
      <h1>Your orders</h1>
      <ul className="orders">
        {orders.map((o) => (
          <li key={o._id}>
            <Link to={`/orders/${o._id}`} className="order-row">
              <div className="order-row__thumbs">{o.items.slice(0, 3).map((i, k) => i.image ? <img key={k} src={i.image} alt="" /> : <span key={k} className="card__placeholder" />)}</div>
              <div className="order-row__body">
                <strong>{o.orderNumber}</strong>
                <span className="muted">{new Date(o.createdAt).toLocaleDateString("en-IN", { dateStyle: "medium" })} · {o.items.reduce((s, i) => s + i.qty, 0)} item{o.items.length > 1 ? "s" : ""}</span>
              </div>
              <span className={`status status--${o.status}`}>{STATUS_LABEL[o.status]}</span>
              <span className="order-row__total">{money(o.total)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
