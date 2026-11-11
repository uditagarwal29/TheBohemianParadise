import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, money } from "../api";
import { useStore } from "../store";
import { Spinner, STATUS_LABEL } from "../components/ui";

export default function Customers() {
  const [sp, setSp] = useSearchParams();
  const [data, setData] = useState(null);
  const [q, setQ] = useState(sp.get("q") || "");
  const [open, setOpen] = useState(null); // { user, orders }
  const { user: me, notify } = useStore();
  const page = parseInt(sp.get("page") || "1", 10);

  const load = () => api.admin.users({ q: sp.get("q") || "", page, limit: 50 }).then(setData);
  useEffect(() => { setData(null); load(); }, [sp.get("q"), page]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (patch) => {
    const next = new URLSearchParams(sp);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    if (!("page" in patch)) next.delete("page");
    setSp(next);
  };

  const toggle = async (u, field) => {
    try {
      await api.admin.updateUser(u._id, { [field]: !u[field] });
      notify("Updated", "success");
      load();
      if (open?.user._id === u._id) setOpen(await api.admin.user(u._id));
    } catch (e) {
      notify(e.message, "error");
    }
  };

  return (
    <>
      <header className="admin__head"><h1>Customers</h1></header>
      <div className="admin__bar">
        <form onSubmit={(e) => { e.preventDefault(); update({ q }); }} className="inline-form">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or email" />
          <button className="btn btn--ghost">Search</button>
        </form>
        {data && <span className="muted small">{data.total} accounts</span>}
      </div>
      {!data ? <Spinner /> : (
        <div className="admin__grid admin__grid--2">
          <table className="table">
            <thead><tr><th>Name</th><th>Email</th><th>Joined</th><th>Role</th><th></th></tr></thead>
            <tbody>
              {data.users.map((u) => (
                <tr key={u._id} className={u.disabled ? "is-muted" : ""}>
                  <td><button className="link" onClick={async () => setOpen(await api.admin.user(u._id))}>{u.name}</button></td>
                  <td className="small">{u.email}</td>
                  <td className="muted small">{new Date(u.createdAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}</td>
                  <td>{u.isAdmin ? <span className="status status--paid">Admin</span> : u.disabled ? <span className="status">Disabled</span> : <span className="muted small">Customer</span>}</td>
                  <td className="actions">
                    {u._id !== me.id && <button className="link" onClick={() => toggle(u, "isAdmin")}>{u.isAdmin ? "Remove admin" : "Make admin"}</button>}
                    {u._id !== me.id && <button className="link danger" onClick={() => toggle(u, "disabled")}>{u.disabled ? "Enable" : "Disable"}</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {open && (
            <section className="panel">
              <h2>{open.user.name}</h2>
              <p className="small"><a href={`mailto:${open.user.email}`}>{open.user.email}</a></p>
              {open.user.addresses?.length > 0 && <><h3>Addresses</h3><ul className="small">{open.user.addresses.map((a) => <li key={a._id}>{a.line1}, {a.city} {a.postalCode}</li>)}</ul></>}
              <h3>Orders ({open.orders.length})</h3>
              {open.orders.length === 0 ? <p className="muted small">No orders yet.</p> : (
                <ul className="statlist">
                  {open.orders.map((o) => <li key={o._id}><Link to={`/admin/orders/${o._id}`}>{o.orderNumber}</Link><span><span className={`status status--${o.status}`}>{STATUS_LABEL[o.status]}</span> {money(o.total)}</span></li>)}
                </ul>
              )}
            </section>
          )}
        </div>
      )}
    </>
  );
}
