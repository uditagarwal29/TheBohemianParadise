import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, money } from "../api";
import { LineChart, Bars } from "./charts";
import { Spinner, STATUS_LABEL } from "../components/ui";

function Kpi({ label, value, sub, tone }) {
  return (
    <div className="kpi">
      <span className="kpi__label">{label}</span>
      <strong className="kpi__value">{value}</strong>
      {sub && <span className={`kpi__sub ${tone || ""}`}>{sub}</span>}
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    api.admin.dashboard().then(setData).catch((e) => setError(e.message));
  }, []);
  if (error) return <p className="alert alert--error">{error}</p>;
  if (!data) return <Spinner />;
  const { summary: s, revenueByDay, topProducts, mostViewed, salesByCategory, recentOrders } = data;
  const change = s.revenue.changePct;

  return (
    <>
      <header className="admin__head">
        <h1>Dashboard</h1>
        <span className="muted small">Updated {new Date(data.generatedAt).toLocaleTimeString("en-IN")}</span>
      </header>

      <div className="kpis">
        <Kpi label="Revenue · 30 days" value={money(s.revenue.last30)} sub={`${change >= 0 ? "▲" : "▼"} ${Math.abs(change)}% vs previous 30`} tone={change >= 0 ? "up" : "down"} />
        <Kpi label="Orders · 30 days" value={s.orders.last30} sub={`avg ${money(s.revenue.avgOrder)} per order`} />
        <Kpi label="Awaiting your confirmation" value={s.orders.awaitingConfirmation} sub="UPI references submitted" tone={s.orders.awaitingConfirmation ? "warn" : ""} />
        <Kpi label="Live pieces" value={s.catalogue.active} sub={`${s.catalogue.soldOut} sold out · ${s.catalogue.lowStock.length} low`} />
        <Kpi label="Customers" value={s.customers.total} sub={`+${s.customers.new30} this month`} />
        <Kpi label="All-time revenue" value={money(s.revenue.allTime)} sub={`${money(s.revenue.thisMonth)} this calendar month`} />
      </div>

      <div className="admin__grid">
        <section className="panel panel--span2">
          <h2>Revenue, last 30 days</h2>
          <LineChart data={revenueByDay} />
        </section>
        <section className="panel">
          <h2>Orders by status</h2>
          <ul className="statlist">
            {Object.entries(s.orders.byStatus).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
              <li key={k}><Link to={`/admin/orders?status=${k}`}><span className={`status status--${k}`}>{STATUS_LABEL[k]}</span></Link><strong>{n}</strong></li>
            ))}
            {Object.keys(s.orders.byStatus).length === 0 && <li className="muted small">No orders yet.</li>}
          </ul>
        </section>
        <section className="panel">
          <h2>Sales by theme</h2>
          <Bars data={salesByCategory} />
        </section>
        <section className="panel">
          <h2>Best sellers</h2>
          <ul className="thumblist">
            {topProducts.map((p) => (
              <li key={p.productId}><Link to={`/admin/products/${p.productId}`}>{p.image ? <img src={p.image} alt="" /> : <span className="card__placeholder" />}<span>{p.title}</span></Link><span className="muted small">{p.qty} sold · {money(p.revenue)}</span></li>
            ))}
            {topProducts.length === 0 && <li className="muted small">No sales yet.</li>}
          </ul>
        </section>
        <section className="panel">
          <h2>Most viewed</h2>
          <ul className="thumblist">
            {mostViewed.map((p) => (
              <li key={p._id}><Link to={`/admin/products/${p._id}`}>{p.images?.[0] ? <img src={p.images[0]} alt="" /> : <span className="card__placeholder" />}<span>{p.title}</span></Link><span className="muted small">{p.views} views · {p.sold} sold</span></li>
            ))}
          </ul>
        </section>
        <section className="panel">
          <h2>Low stock</h2>
          {s.catalogue.lowStock.length === 0 ? <p className="muted small">Nothing running low.</p> : (
            <ul className="thumblist">
              {s.catalogue.lowStock.map((p) => (
                <li key={p._id}><Link to={`/admin/products/${p._id}`}>{p.images?.[0] ? <img src={p.images[0]} alt="" /> : <span className="card__placeholder" />}<span>{p.title}</span></Link>
                  <span className="muted small">{p.variants?.length ? p.variants.filter((v) => v.stock <= 2).map((v) => `${v.size}: ${v.stock}`).join(", ") : `${p.stock} left`}</span></li>
              ))}
            </ul>
          )}
        </section>
        <section className="panel panel--span2">
          <h2>Recent orders</h2>
          <table className="table">
            <thead><tr><th>Order</th><th>Customer</th><th>Status</th><th className="num">Total</th><th>Placed</th></tr></thead>
            <tbody>
              {recentOrders.map((o) => (
                <tr key={o._id}>
                  <td><Link to={`/admin/orders/${o._id}`}>{o.orderNumber}</Link></td>
                  <td>{o.userId?.name || "—"}<br /><span className="muted small">{o.userId?.email}</span></td>
                  <td><span className={`status status--${o.status}`}>{STATUS_LABEL[o.status]}</span></td>
                  <td className="num">{money(o.total)}</td>
                  <td className="muted small">{new Date(o.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
