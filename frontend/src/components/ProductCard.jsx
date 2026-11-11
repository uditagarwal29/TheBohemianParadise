import { Link } from "react-router-dom";
import { money } from "../api";

export function StockBadge({ product, size }) {
  const stock = size && product.variants?.length ? product.variants.find((v) => v.size === size)?.stock ?? 0 : product.totalStock;
  if (stock <= 0) return <span className="badge badge--out">Sold out</span>;
  if (product.isOriginal) return <span className="badge badge--one">Original · 1 of 1</span>;
  if (stock <= 3) return <span className="badge badge--low">Only {stock} left</span>;
  return null;
}

export default function ProductCard({ product }) {
  const img = product.images?.[0] || product.img?.[0];
  const prices = product.variants?.length ? product.variants.map((v) => v.price) : [product.price];
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return (
    <Link to={`/product/${product.slug || product._id}`} className={`card ${product.totalStock <= 0 ? "card--out" : ""}`}>
      <div className="card__media">
        {img ? <img src={img} alt={product.title} loading="lazy" /> : <div className="card__placeholder" />}
        <div className="card__badges"><StockBadge product={product} /></div>
      </div>
      <div className="card__body">
        <h3 className="card__title">{product.title}</h3>
        <div className="card__meta">
          <span className="card__price">{min === max ? money(min) : `${money(min)} – ${money(max)}`}</span>
          {product.variants?.length > 0 && <span className="card__sizes">{product.variants.map((v) => v.size).join(" · ")}</span>}
        </div>
      </div>
    </Link>
  );
}
