import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, money } from "../api";
import { useStore } from "../store";
import { Spinner } from "../components/ui";

const FILTERS = [["", "All"], ["active", "Live"], ["low", "Low stock"], ["sold_out", "Sold out"], ["hidden", "Hidden"]];

export default function Products() {
  const [sp, setSp] = useSearchParams();
  const [data, setData] = useState(null);
  const [q, setQ] = useState(sp.get("q") || "");
  const { notify } = useStore();
  const status = sp.get("status") || "";
  const page = parseInt(sp.get("page") || "1", 10);

  const load = () => api.admin.products({ status, q: sp.get("q") || "", page, limit: 30 }).then(setData).catch((e) => notify(e.message, "error"));
  useEffect(() => { setData(null); load(); }, [status, sp.get("q"), page]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (patch) => {
    const next = new URLSearchParams(sp);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    if (!("page" in patch)) next.delete("page");
    setSp(next);
  };

  const toggle = async (p) => {
    try {
      if (p.active) await api.admin.hideProduct(p._id);
      else await api.admin.restoreProduct(p._id);
      notify(p.active ? `${p.title} hidden from the shop` : `${p.title} is live again`, "success");
      load();
    } catch (e) {
      notify(e.message, "error");
    }
  };

  const quickStock = async (p, delta) => {
    try {
      await api.admin.adjustStock(p._id, delta);
      load();
    } catch (e) {
      notify(e.message, "error");
    }
  };

  return (
    <>
      <header className="admin__head">
        <h1>Products</h1>
        <Link to="/admin/products/new" className="btn btn--primary">Add a piece</Link>
      </header>
      <div className="admin__bar">
        <div className="chips">
          {FILTERS.map(([v, l]) => <button key={v} className={`chip ${status === v ? "is-active" : ""}`} onClick={() => update({ status: v })}>{l}</button>)}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); update({ q }); }} className="inline-form">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title or description" />
          <button className="btn btn--ghost">Search</button>
        </form>
      </div>
      {!data ? <Spinner /> : (
        <>
          <table className="table">
            <thead><tr><th></th><th>Title</th><th>Themes</th><th className="num">Price</th><th>Stock</th><th className="num">Sold</th><th className="num">Views</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {data.items.map((p) => (
                <tr key={p._id} className={p.active ? "" : "is-muted"}>
                  <td className="thumb">{p.images?.[0] ? <img src={p.images[0]} alt="" /> : <span className="card__placeholder" />}</td>
                  <td><Link to={`/admin/products/${p._id}`}><strong>{p.title}</strong></Link>{p.isOriginal && <span className="badge badge--one">Original</span>}</td>
                  <td className="muted small">{p.categories.join(", ")}</td>
                  <td className="num">{p.variants?.length ? `${money(Math.min(...p.variants.map((v) => v.price)))}+` : money(p.price)}</td>
                  <td>
                    {p.variants?.length ? (
                      <span className="small">{p.variants.map((v) => `${v.size} ${v.stock}`).join(" · ")}</span>
                    ) : (
                      <span className="stock-ctl">
                        <button onClick={() => quickStock(p, -1)} disabled={p.stock <= 0} aria-label="minus one">−</button>
                        <strong className={p.stock <= 0 ? "down" : p.stock <= 2 ? "warn" : ""}>{p.stock}</strong>
                        <button onClick={() => quickStock(p, 1)} aria-label="plus one">+</button>
                      </span>
                    )}
                  </td>
                  <td className="num">{p.sold}</td>
                  <td className="num muted">{p.views}</td>
                  <td>{!p.active ? <span className="status">Hidden</span> : p.totalStock <= 0 ? <span className="status status--cancelled">Sold out</span> : <span className="status status--paid">Live</span>}</td>
                  <td className="actions"><Link to={`/admin/products/${p._id}`}>Edit</Link><button className="link" onClick={() => toggle(p)}>{p.active ? "Hide" : "Show"}</button></td>
                </tr>
              ))}
              {data.items.length === 0 && <tr><td colSpan="9" className="muted" style={{ textAlign: "center", padding: 30 }}>Nothing matches.</td></tr>}
            </tbody>
          </table>
          {data.pages > 1 && (
            <nav className="pager">
              <button disabled={page <= 1} onClick={() => update({ page: String(page - 1) })}>Previous</button>
              <span>Page {page} of {data.pages} · {data.total} pieces</span>
              <button disabled={page >= data.pages} onClick={() => update({ page: String(page + 1) })}>Next</button>
            </nav>
          )}
        </>
      )}
    </>
  );
}
