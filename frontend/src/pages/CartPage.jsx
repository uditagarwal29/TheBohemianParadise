import { Link, useNavigate } from "react-router-dom";
import { money } from "../api";
import { useStore } from "../store";
import { Alert, Empty, Qty } from "../components/ui";

export function Summary({ cart, children }) {
  return (
    <aside className="summary">
      <h2>Order summary</h2>
      <dl>
        <dt>Subtotal</dt><dd>{money(cart.subtotal)}</dd>
        <dt>Shipping</dt><dd>{cart.shipping === 0 ? "Free" : money(cart.shipping)}</dd>
        <dt className="summary__total">Total</dt><dd className="summary__total">{money(cart.total)}</dd>
      </dl>
      {children}
    </aside>
  );
}

export default function CartPage() {
  const { cart, cartLoading, setQty, removeFromCart, user } = useStore();
  const navigate = useNavigate();
  const blocking = cart.problems.filter((p) => p.code !== "price_changed");

  if (!cartLoading && cart.items.length === 0 && cart.problems.length === 0) {
    return (
      <Empty title="Your bag is empty">
        <p className="muted">Original art waits for no one. Have a look at what's available.</p>
        <Link to="/products?inStock=1" className="btn btn--primary">Shop available pieces</Link>
      </Empty>
    );
  }

  return (
    <section className="section cart">
      <h1>Your bag</h1>
      {cart.problems.length > 0 && (
        <Alert kind={blocking.length ? "warn" : "info"}>
          <strong>Heads up:</strong>
          <ul>{cart.problems.map((p, k) => <li key={k}>{p.message}</li>)}</ul>
        </Alert>
      )}
      <div className="cart__grid">
        <ul className="cart__lines">
          {cart.items.map((line) => (
            <li className="line" key={`${line.productId}|${line.size || ""}`}>
              <Link to={`/product/${line.slug || line.productId}`} className="line__media">
                {line.image ? <img src={line.image} alt="" /> : <div className="card__placeholder" />}
              </Link>
              <div className="line__body">
                <Link to={`/product/${line.slug || line.productId}`} className="line__title">{line.title}</Link>
                {line.size && <div className="muted">Size {line.size}</div>}
                <div className="muted">{money(line.unitPrice)} each{line.available <= 3 ? ` · only ${line.available} left` : ""}</div>
                <div className="line__actions">
                  <Qty value={line.qty} max={line.available} onChange={(q) => setQty(line.productId, line.size, q)} disabled={cartLoading} />
                  <button className="link" onClick={() => removeFromCart(line.productId, line.size)}>Remove</button>
                </div>
              </div>
              <div className="line__total">{money(line.lineTotal)}</div>
            </li>
          ))}
        </ul>
        <Summary cart={cart}>
          <button className="btn btn--primary btn--block" disabled={cartLoading || cart.items.length === 0 || blocking.length > 0} onClick={() => navigate(user ? "/checkout" : "/login?next=/checkout")}>
            {user ? "Checkout" : "Sign in to checkout"}
          </button>
          {!user && <p className="muted small">You'll need an account so we can send you order updates. Your bag comes with you.</p>}
          <Link to="/products" className="link">Continue shopping</Link>
        </Summary>
      </div>
    </section>
  );
}
