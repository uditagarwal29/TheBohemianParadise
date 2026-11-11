import { useMemo, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { money } from "../api";
import { Alert } from "./ui";

const PK = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

function Form({ orderId, amount }) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const pay = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setError(null);
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}/orders/${orderId}?paid=1` },
    });
    if (error) setError(error.message);
    setBusy(false);
  };

  return (
    <form onSubmit={pay} className="panel">
      <PaymentElement />
      {error && <Alert kind="error">{error}</Alert>}
      <button className="btn btn--primary btn--block" disabled={!stripe || busy}>{busy ? "Processing…" : `Pay ${money(amount)}`}</button>
    </form>
  );
}

export default function StripePayment({ clientSecret, orderId, amount }) {
  const stripePromise = useMemo(() => (PK ? loadStripe(PK) : null), []);
  if (!PK) {
    return <Alert kind="error">Card payments are not configured on this site (missing VITE_STRIPE_PUBLISHABLE_KEY at build time). Please choose another payment method.</Alert>;
  }
  return (
    <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "stripe", variables: { colorPrimary: "#029494", fontFamily: "Urbanist, sans-serif" } } }}>
      <Form orderId={orderId} amount={amount} />
    </Elements>
  );
}
