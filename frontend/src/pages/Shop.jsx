import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { categoryArt, titleCase } from "../data";
import ProductCard from "../components/ProductCard";
import { Empty } from "../components/ui";

const SORTS = [
  ["newest", "Newest"],
  ["price_asc", "Price: low to high"],
  ["price_desc", "Price: high to low"],
  ["popular", "Most loved"],
];

export default function Shop() {
  const { category } = useParams();
  const [sp, setSp] = useSearchParams();
  const [data, setData] = useState(null);
  const [cats, setCats] = useState([]);
  const [error, setError] = useState(null);

  const q = sp.get("q") || "";
  const sort = sp.get("sort") || "newest";
  const inStock = sp.get("inStock") === "1";
  const page = parseInt(sp.get("page") || "1", 10);

  useEffect(() => {
    api.products.categories().then(setCats).catch(() => {});
  }, []);

  useEffect(() => {
    setData(null);
    setError(null);
    api.products
      .list({ category, q, sort, inStock: inStock ? 1 : undefined, page, limit: 12 })
      .then(setData)
      .catch((e) => setError(e.message));
  }, [category, q, sort, inStock, page]);

  const update = (patch) => {
    const next = new URLSearchParams(sp);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    if (!("page" in patch)) next.delete("page");
    setSp(next);
  };

  const heading = q ? `Results for “${q}”` : category ? categoryArt[category]?.title || titleCase(category) : "The collection";

  return (
    <section className="section shop">
      <header className="shop__head">
        <h1>{heading}</h1>
        {data && <span className="muted">{data.total} {data.total === 1 ? "piece" : "pieces"}</span>}
      </header>

      <div className="shop__bar">
        <div className="chips">
          <Link to={`/products${sp.toString() ? `?${sp}` : ""}`} className={`chip ${!category ? "is-active" : ""}`}>All</Link>
          {cats.map((c) => (
            <Link key={c.name} to={`/products/${c.name}${sp.toString() ? `?${sp}` : ""}`} className={`chip ${category === c.name ? "is-active" : ""}`}>
              {categoryArt[c.name]?.title || titleCase(c.name)}
            </Link>
          ))}
        </div>
        <div className="shop__controls">
          <label className="toggle">
            <input type="checkbox" checked={inStock} onChange={(e) => update({ inStock: e.target.checked ? "1" : "" })} />
            <span>Available only</span>
          </label>
          <select value={sort} onChange={(e) => update({ sort: e.target.value })} aria-label="Sort">
            {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>

      {error ? (
        <Empty title="Couldn't load the collection"><p className="muted">{error}</p></Empty>
      ) : data === null ? (
        <div className="grid grid--products">{Array.from({ length: 8 }).map((_, k) => <div className="card card--skeleton" key={k} />)}</div>
      ) : data.items.length === 0 ? (
        <Empty title="Nothing here yet">
          <p className="muted">{q ? "Try a different search." : inStock ? "Everything in this theme is sold out right now." : "New pieces are coming."}</p>
          <Link className="btn btn--ghost" to="/products">Browse everything</Link>
        </Empty>
      ) : (
        <>
          <div className="grid grid--products">{data.items.map((p) => <ProductCard key={p._id} product={p} />)}</div>
          {data.pages > 1 && (
            <nav className="pager" aria-label="Pages">
              <button disabled={page <= 1} onClick={() => update({ page: String(page - 1) })}>Previous</button>
              <span>Page {page} of {data.pages}</span>
              <button disabled={page >= data.pages} onClick={() => update({ page: String(page + 1) })}>Next</button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
