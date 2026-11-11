import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, money } from "../api";
import { useStore } from "../store";
import { AddressForm, Alert, EMPTY_ADDRESS, Empty, Spinner, formatAddress, useAsync } from "../components/ui";
import { Summary } from "./CartPage";
import StripePayment from "../components/StripePayment";

export default function Checkout() {
  const { user, setUser, cart, cartLoading, refreshCart, notify } = useStore();
  const navigate = useNavigate();
  const [methods, setMethods] = useState(null);
  const [method, setMethod] = useState("");
  const [addressId, setAddressId] = useState(user.addresses?.[0]?._id || "new");
  const [address, setAddress] = useState(EMPTY_ADDRESS);
  const [saveAddress, setSaveAddress] = useState(true);
  const [note, setNote] = useState("");
  const [placed, setPlaced] = useState(null); // { order, payment }
  const { busy, error, run, setError } = useAsync();

  useEffect(() => {
    api.orders.paymentMethods().then((m) => {
      setMethods(m);
      setMethod(m.methods[0]?.id || "");
    });
    refreshCart(true);
  }, [refreshCart]);

  const blocking = cart.problems.filter((p) => p.code !== "price_changed");

  const placeOrder = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const result = await run(async () => {
        let payload = { paymentMethod: method, customerNote: note || undefined };
        if (addressId === "new") {
          if (saveAddress) {
            const { addresses } = await api.users.addAddress(address);
            const saved = addresses[addresses.length - 1];
            setUser({ ...user, addresses });
            payload.addressId = saved._id;
          } else {
            payload.shippingAddress = address;
          }
        } else {
          payload.addressId = addressId;
        }
        return api.orders.checkout(payload);
      });
      if (result.priceChanges?.length) notify("Some prices were updated before placing your order", "info");
      await refreshCart(true);
      if (result.payment.method === "stripe") {
        setPlaced(result);
      } else {
        navigate(`/orders/${result.order._id}?placed=1`, { replace: true });
      }
    } catch (err) {
      if (err.status === 409) await refreshCart(true);
    }
  };

  if (methods === null || (cartLoading && cart.items.length === 0)) return <Spinner />;

  if (placed) {
    return (
      <section className="section checkout">
        <h1>Pay for order {placed.order.orderNumber}</h1>
        <div className="checkout__grid">
          <div>
            <Alert kind="info">Your pieces are reserved for 30 minutes while you pay.</Alert>
            <StripePayment clientSecret={placed.payment.clientSecret} orderId={placed.order._id} amount={placed.order.total} />
          </div>
          <Summary cart={{ subtotal: placed.order.subtotal, shipping: placed.order.shipping, total: placed.order.total }} />
        </div>
      </section>
    );
  }

  if (cart.items.length === 0) {
    return (
      <Empty title="Nothing to check out">
        <Link to="/products?inStock=1" className="btn btn--primary">Shop available pieces</Link>
      </Empty>
    );
  }

  return (
    <section className="section checkout">
      <h1>Checkout</h1>
      <form className="checkout__grid" onSubmit={placeOrder}>
        <div className="checkout__main">
          {blocking.length > 0 && (
            <Alert kind="warn">
              Some items in your bag need attention before you can order.
              <ul>{blocking.map((p, k) => <li key={k}>{p.message}</li>)}</ul>
              <Link to="/cart">Fix your bag</Link>
            </Alert>
          )}
          {error && <Alert kind="error">{error.message}{error.details?.problems && <ul>{error.details.problems.map((p, k) => <li key={k}>{p.message}</li>)}</ul>}</Alert>}

          <fieldset className="panel">
            <legend>1. Delivery address</legend>
            {user.addresses?.length > 0 && (
              <div className="radios">
                {user.addresses.map((a) => (
                  <label key={a._id} className={`radio ${addressId === a._id ? "is-active" : ""}`}>
                    <input type="radio" name="address" checked={addressId === a._id} onChange={() => setAddressId(a._id)} />
                    <span>{formatAddress(a)}</span>
                  </label>
                ))}
                <label className={`radio ${addressId === "new" ? "is-active" : ""}`}>
                  <input type="radio" name="address" checked={addressId === "new"} onChange={() => setAddressId("new")} />
                  <span>Use a new address</span>
                </label>
              </div>
            )}
            {addressId === "new" && (
              <>
                <AddressForm value={address} onChange={setAddress} errors={error?.details || {}} />
                <label className="check"><input type="checkbox" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} /> Save this address for next time</label>
              </>
            )}
          </fieldset>

          <fieldset className="panel">
            <legend>2. Payment</legend>
            <div className="radios">
              {methods.methods.map((m) => (
                <label key={m.id} className={`radio ${method === m.id ? "is-active" : ""}`}>
                  <input type="radio" name="method" checked={method === m.id} onChange={() => setMethod(m.id)} />
                  <span>{m.label}</span>
                </label>
              ))}
            </div>
            {method === "manual" && <p className="muted small">After you place the order you'll see the payment details. Your pieces stay reserved for 24 hours while the seller confirms the transfer.</p>}
          </fieldset>

          <fieldset className="panel">
            <legend>3. Anything we should know?</legend>
            <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 500))} rows={3} placeholder="Gift message, delivery instructions…" />
          </fieldset>
        </div>

        <Summary cart={cart}>
          <ul className="summary__items">
            {cart.items.map((i) => <li key={`${i.productId}|${i.size || ""}`}><span>{i.qty} × {i.title}{i.size ? ` (${i.size})` : ""}</span><span>{money(i.lineTotal)}</span></li>)}
          </ul>
          <button className="btn btn--primary btn--block" disabled={busy || blocking.length > 0 || !method}>
            {busy ? "Placing order…" : method === "stripe" ? `Continue to payment · ${money(cart.total)}` : `Place order · ${money(cart.total)}`}
          </button>
        </Summary>
      </form>
    </section>
  );
}
