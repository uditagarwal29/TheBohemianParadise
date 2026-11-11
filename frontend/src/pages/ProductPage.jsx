import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, money } from "../api";
import { useStore } from "../store";
import { categoryArt, titleCase } from "../data";
import { StockBadge } from "../components/ProductCard";
import { Empty, Qty, Spinner } from "../components/ui";

export default function ProductPage() {
  const { idOrSlug } = useParams();
  const navigate = useNavigate();
  const { addToCart, cart } = useStore();
  const [product, setProduct] = useState(null);
  const [status, setStatus] = useState("loading");
  const [img, setImg] = useState(0);
  const [size, setSize] = useState("");
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [showFrame, setShowFrame] = useState(false);

  useEffect(() => {
    setStatus("loading");
    setImg(0);
    setQty(1);
    api.products
      .one(idOrSlug)
      .then((p) => {
        setProduct(p);
        const first = p.variants?.find((v) => v.stock > 0) || p.variants?.[0];
        setSize(first?.size || "");
        setStatus("ok");
      })
      .catch((e) => setStatus(e.status === 404 ? "missing" : "error"));
  }, [idOrSlug]);

  const variant = useMemo(() => product?.variants?.find((v) => v.size === size), [product, size]);
  const hasVariants = product?.variants?.length > 0;
  const price = hasVariants ? variant?.price : product?.price;
  const stock = hasVariants ? variant?.stock ?? 0 : product?.stock ?? 0;
  const inBag = cart.items.find((i) => i.productId === product?._id && (i.size || null) === (hasVariants ? size : null))?.qty || 0;
  const canAdd = stock - inBag;

  if (status === "loading") return <Spinner />;
  if (status === "missing") return <Empty title="This piece isn't available anymore"><Link className="btn btn--ghost" to="/products">Back to the collection</Link></Empty>;
  if (status === "error") return <Empty title="Something went wrong"><p className="muted">Please try again in a moment.</p></Empty>;

  const images = product.images?.length ? product.images : product.img || [];
  const add = async (thenCheckout) => {
    setBusy(true);
    try {
      await addToCart(product, hasVariants ? size : null, qty, price);
      if (thenCheckout) navigate("/cart");
    } catch (e) {
      /* toast already shown by store via error, keep page */
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="section product">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/products">Collection</Link>
        {product.categories?.[0] && <><span>/</span><Link to={`/products/${product.categories[0]}`}>{categoryArt[product.categories[0]]?.title || titleCase(product.categories[0])}</Link></>}
        <span>/</span><span>{product.title}</span>
      </nav>

      <div className="product__grid">
        <div className="product__gallery">
          <div className={`product__main ${showFrame ? "product__main--framed" : ""}`}>
            {showFrame ? (
              <div className="frame-preview">
                <img src="/images/walltemplate.jpg" alt="" className="frame-preview__wall" />
                <img src={images[img]} alt={product.title} className="frame-preview__art" />
              </div>
            ) : images[img] ? (
              <img src={images[img]} alt={product.title} />
            ) : (
              <div className="card__placeholder" />
            )}
          </div>
          <div className="product__thumbs">
            {images.map((src, k) => (
              <button key={src + k} className={!showFrame && k === img ? "is-active" : ""} onClick={() => { setImg(k); setShowFrame(false); }} aria-label={`Image ${k + 1}`}>
                <img src={src} alt="" />
              </button>
            ))}
            {images.length > 0 && (
              <button className={`thumb-frame ${showFrame ? "is-active" : ""}`} onClick={() => setShowFrame((s) => !s)} aria-label="Preview on a wall">On a wall</button>
            )}
          </div>
        </div>

        <div className="product__info">
          <div className="product__badges"><StockBadge product={product} size={hasVariants ? size : undefined} /></div>
          <h1>{product.title}</h1>
          <div className="product__price">{price !== undefined && price !== null ? money(price) : "—"}</div>
          <dl className="product__specs">
            {product.medium && <><dt>Medium</dt><dd>{product.medium}</dd></>}
            {product.dimensions && <><dt>Size</dt><dd>{product.dimensions}</dd></>}
            {product.isOriginal && <><dt>Edition</dt><dd>Original artwork, signed</dd></>}
          </dl>
          <p className="product__desc">{product.desc}</p>

          {hasVariants && (
            <div className="product__sizes">
              <span className="field__label">Choose a size</span>
              <div className="size-grid">
                {product.variants.map((v) => (
                  <button key={v.size} className={`size ${v.size === size ? "is-active" : ""} ${v.stock <= 0 ? "is-out" : ""}`} onClick={() => { setSize(v.size); setQty(1); }} disabled={v.stock <= 0}>
                    <span>{v.size}</span>
                    <small>{v.stock <= 0 ? "Sold out" : money(v.price)}</small>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="product__buy">
            {stock > 0 && !product.isOriginal && (
              <Qty value={qty} max={Math.max(1, canAdd)} onChange={setQty} disabled={canAdd <= 0} />
            )}
            {stock <= 0 ? (
              <button className="btn btn--primary" disabled>Sold out</button>
            ) : canAdd <= 0 ? (
              <Link className="btn btn--primary" to="/cart">Already in your bag · View bag</Link>
            ) : (
              <>
                <button className="btn btn--primary" onClick={() => add(false)} disabled={busy}>{busy ? "Adding…" : "Add to bag"}</button>
                <button className="btn btn--ghost" onClick={() => add(true)} disabled={busy}>Buy now</button>
              </>
            )}
          </div>
          {stock > 0 && stock <= 3 && <p className="product__urgency">{product.isOriginal ? "This is the only one. Once it's sold, it's gone." : `Only ${stock} left in this size.`}</p>}

          <ul className="product__notes">
            <li>Free shipping across India, packed by hand.</li>
            <li>Dispatched within 3–5 working days of payment.</li>
            <li>Questions about framing or a custom size? <a href="mailto:agarwal.udit1999@gmail.com">Write to us</a>.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
