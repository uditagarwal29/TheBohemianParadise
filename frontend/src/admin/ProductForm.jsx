import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, money } from "../api";
import { useStore } from "../store";
import { Alert, Field, Spinner, useAsync } from "../components/ui";
import { categoryArt } from "../data";

const EMPTY = { title: "", desc: "", price: "", stock: 1, categories: [], tags: [], images: [], variants: [], isOriginal: false, medium: "", dimensions: "", featured: false, active: true };
const KNOWN_CATEGORIES = Object.keys(categoryArt).filter((c) => !["portraits", "seascape"].includes(c));

function ImageUploader({ images, onChange, productId, maxMb }) {
  const inputRef = useRef();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [drag, setDrag] = useState(false);

  const handleFiles = async (files) => {
    if (!files?.length) return;
    setBusy(true);
    setErr(null);
    try {
      const res = productId ? await api.admin.uploadProductImages(productId, files) : await api.admin.uploadImages(files);
      onChange(productId ? res.product.images : [...images, ...res.uploaded.map((u) => u.url)]);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (url) => {
    if (productId) {
      try {
        const p = await api.admin.removeImage(productId, url);
        onChange(p.images);
      } catch (e) {
        setErr(e.message);
      }
    } else {
      onChange(images.filter((u) => u !== url));
    }
  };

  const move = (from, to) => {
    if (to < 0 || to >= images.length) return;
    const next = [...images];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    onChange(next);
  };

  return (
    <div className="uploader">
      <div
        className={`dropzone ${drag ? "is-drag" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current.click()}
        role="button"
        tabIndex={0}
      >
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }} />
        {busy ? "Uploading…" : <>Drop photos here or <u>browse</u><br /><span className="muted small">JPG, PNG, WebP · up to {maxMb} MB each · first image is the cover</span></>}
      </div>
      {err && <Alert kind="error">{err}</Alert>}
      {images.length > 0 && (
        <ul className="gallery">
          {images.map((url, i) => (
            <li key={url}>
              <img src={url} alt="" />
              <div className="gallery__tools">
                <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label="Move left">←</button>
                <button type="button" onClick={() => move(i, i + 1)} disabled={i === images.length - 1} aria-label="Move right">→</button>
                <button type="button" className="danger" onClick={() => remove(url)} aria-label="Remove">✕</button>
              </div>
              {i === 0 && <span className="gallery__cover">Cover</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Variants({ variants, onChange }) {
  const set = (i, k, v) => onChange(variants.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  return (
    <div className="variants">
      {variants.map((v, i) => (
        <div className="variants__row" key={i}>
          <input value={v.size} onChange={(e) => set(i, "size", e.target.value)} placeholder="Size (A4)" required />
          <input type="number" min="0" value={v.price} onChange={(e) => set(i, "price", e.target.value)} placeholder="Price" required />
          <input type="number" min="0" step="1" value={v.stock} onChange={(e) => set(i, "stock", e.target.value)} placeholder="Stock" required />
          <button type="button" className="link danger" onClick={() => onChange(variants.filter((_, j) => j !== i))}>Remove</button>
        </div>
      ))}
      <button type="button" className="btn btn--ghost" onClick={() => onChange([...variants, { size: "", price: "", stock: 1 }])}>Add a size</button>
    </div>
  );
}

export default function ProductForm() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const { notify } = useStore();
  const [form, setForm] = useState(isNew ? EMPTY : null);
  const [settings, setSettings] = useState({ maxUploadMb: 8, storage: "local" });
  const [catInput, setCatInput] = useState("");
  const { busy, error, run } = useAsync();

  useEffect(() => {
    api.admin.settings().then(setSettings).catch(() => {});
    if (!isNew) api.admin.product(id).then((p) => setForm({ ...EMPTY, ...p, price: p.price ?? "", images: p.images || [] })).catch((e) => notify(e.message, "error"));
  }, [id, isNew, notify]);

  if (!form) return <Spinner />;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const hasVariants = form.variants.length > 0;

  const addCategory = (c) => {
    const v = c.trim().toLowerCase();
    if (v && !form.categories.includes(v)) setForm({ ...form, categories: [...form.categories, v] });
    setCatInput("");
  };

  const submit = async (e) => {
    e.preventDefault();
    const payload = {
      title: form.title,
      desc: form.desc,
      price: Number(form.price) || (hasVariants ? Number(form.variants[0].price) : 0),
      stock: hasVariants ? 0 : Number(form.stock),
      categories: form.categories,
      tags: form.tags,
      images: form.images,
      variants: form.variants.map((v) => ({ size: v.size.trim(), price: Number(v.price), stock: Number(v.stock) })),
      isOriginal: Boolean(form.isOriginal),
      medium: form.medium || undefined,
      dimensions: form.dimensions || undefined,
      featured: Boolean(form.featured),
      active: Boolean(form.active),
    };
    try {
      const saved = await run(() => (isNew ? api.admin.createProduct(payload) : api.admin.updateProduct(id, payload)));
      notify(isNew ? `${saved.title} added` : "Saved", "success");
      if (isNew) navigate(`/admin/products/${saved._id}`, { replace: true });
      else setForm({ ...EMPTY, ...saved });
    } catch {}
  };

  return (
    <>
      <header className="admin__head">
        <div>
          <Link to="/admin/products" className="muted small">← Products</Link>
          <h1>{isNew ? "Add a piece" : form.title}</h1>
        </div>
        {!isNew && <a className="btn btn--ghost" href={`/product/${form.slug}`} target="_blank" rel="noreferrer">View in shop</a>}
      </header>

      <form className="admin__form" onSubmit={submit}>
        <div className="admin__form-main">
          {error && <Alert kind="error">{error.message}{error.details && <ul>{Object.entries(error.details).map(([k, v]) => <li key={k}>{k}: {v}</li>)}</ul>}</Alert>}

          <section className="panel">
            <h2>Photos</h2>
            {isNew && <p className="muted small">Photos upload straight away; they're attached when you save the piece.</p>}
            <ImageUploader images={form.images} onChange={(images) => setForm({ ...form, images })} productId={isNew ? null : id} maxMb={settings.maxUploadMb} />
            {settings.storage === "local" && <p className="muted small">Storage: local disk (development). Set CLOUDINARY_URL in production so uploads survive deploys.</p>}
          </section>

          <section className="panel">
            <h2>Details</h2>
            <Field label="Title"><input value={form.title} onChange={set("title")} required maxLength={120} /></Field>
            <Field label="Description"><textarea value={form.desc} onChange={set("desc")} rows={5} required maxLength={4000} /></Field>
            <div className="address-form__row">
              <Field label="Medium"><input value={form.medium || ""} onChange={set("medium")} placeholder="Watercolour on paper" /></Field>
              <Field label="Dimensions"><input value={form.dimensions || ""} onChange={set("dimensions")} placeholder="18 × 24 in" /></Field>
            </div>
            <Field label="Themes" hint="Press Enter to add. Lowercase, used for filtering.">
              <div className="chips chips--input">
                {form.categories.map((c) => <button type="button" key={c} className="chip is-active" onClick={() => setForm({ ...form, categories: form.categories.filter((x) => x !== c) })}>{c} ✕</button>)}
                <input value={catInput} onChange={(e) => setCatInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCategory(catInput); } }} placeholder="nature, zodiac…" list="cats" />
                <datalist id="cats">{KNOWN_CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
              </div>
            </Field>
          </section>

          <section className="panel">
            <h2>Pricing &amp; stock</h2>
            <label className="check"><input type="checkbox" checked={form.isOriginal} onChange={(e) => setForm({ ...form, isOriginal: e.target.checked, stock: e.target.checked ? 1 : form.stock, variants: e.target.checked ? [] : form.variants })} /> This is an original (one of a kind, stock 1, no sizes)</label>
            {!form.isOriginal && (
              <>
                <p className="muted small">Prints: add one row per size. Leave empty for a single price and stock.</p>
                <Variants variants={form.variants} onChange={(variants) => setForm({ ...form, variants })} />
              </>
            )}
            <div className="address-form__row">
              <Field label={hasVariants ? "Base price (shown as 'from')" : "Price (₹)"}><input type="number" min="0" value={form.price} onChange={set("price")} required={!hasVariants} /></Field>
              {!hasVariants && <Field label="Stock"><input type="number" min="0" step="1" value={form.stock} onChange={set("stock")} disabled={form.isOriginal && !isNew} /></Field>}
            </div>
          </section>

          <section className="panel">
            <h2>Visibility</h2>
            <label className="check"><input type="checkbox" checked={form.active} onChange={set("active")} /> Live in the shop</label>
            <label className="check"><input type="checkbox" checked={form.featured} onChange={set("featured")} /> Featured</label>
          </section>
        </div>

        <aside className="admin__form-side">
          <div className="panel">
            <button className="btn btn--primary btn--block" disabled={busy}>{busy ? "Saving…" : isNew ? "Create piece" : "Save changes"}</button>
            {!isNew && (
              <dl className="statlist statlist--dl">
                <dt>Sold</dt><dd>{form.sold ?? 0}</dd>
                <dt>Views</dt><dd>{form.views ?? 0}</dd>
                <dt>Slug</dt><dd className="small">{form.slug}</dd>
                <dt>Shown as</dt><dd>{hasVariants ? `from ${money(Math.min(...form.variants.map((v) => Number(v.price) || 0)))}` : money(Number(form.price) || 0)}</dd>
              </dl>
            )}
          </div>
        </aside>
      </form>
    </>
  );
}
