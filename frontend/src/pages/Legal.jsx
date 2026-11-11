import { Link } from "react-router-dom";
import { contact } from "../data";

const UPDATED = "11 November 2026";

export function Privacy() {
  return (
    <section className="section legal">
      <h1>Privacy policy</h1>
      <p className="muted">Last updated {UPDATED}</p>
      <p>The Bohemian Paradise ("we") is a small independent art studio in New Delhi, India, selling original paintings and prints at tbp.onrender.com. This page explains what we collect and why.</p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Account details:</strong> your name and email address when you register, and a hashed password if you choose one. If you sign in with Google, we receive your name, email address and profile picture from Google; we never see your Google password.</li>
        <li><strong>Order details:</strong> the items you buy, the delivery address and phone number you give us, and payment references (UPI or bank transfer reference, or a Stripe payment identifier). We do not store card numbers; card payments, when offered, are processed by Stripe.</li>
        <li><strong>Shopping bag:</strong> items you add to your bag are stored in your browser and, once signed in, in your account so they follow you between devices.</li>
        <li><strong>Technical data:</strong> standard server logs (IP address, browser, pages requested) kept briefly for security and to keep the site running. We do not use advertising or tracking cookies.</li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To let you sign in, keep your bag, and place and track orders.</li>
        <li>To pack and ship what you bought and to contact you about your order.</li>
        <li>To confirm payments and prevent fraud.</li>
        <li>To understand which pieces people view and buy, so we know what to paint next. This is aggregate and tied to products, not to profiling individuals.</li>
      </ul>
      <p>We do not sell or rent your information, and we do not send marketing emails unless you ask us to.</p>

      <h2>Who else sees it</h2>
      <ul>
        <li><strong>Hosting and database:</strong> Render and MongoDB Atlas store the site and its data.</li>
        <li><strong>Images:</strong> product photos are hosted on an image CDN; they contain no personal data.</li>
        <li><strong>Google:</strong> only if you choose "Sign in with Google", under <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google's privacy policy</a>.</li>
        <li><strong>Stripe:</strong> only if you pay by card, under Stripe's privacy policy.</li>
        <li><strong>Couriers:</strong> your name, address and phone number, to deliver your order.</li>
      </ul>

      <h2>How long we keep it</h2>
      <p>Account data stays until you close your account. Order records are kept for as long as Indian tax and accounting rules require. Server logs are deleted within a few weeks.</p>

      <h2>Your choices</h2>
      <ul>
        <li>Edit your name, email and addresses any time from <Link to="/account">your account</Link>.</li>
        <li>Close your account from the same page; we stop using your data except for the order records we must keep.</li>
        <li>Email us at <a href={`mailto:${contact.email}`}>{contact.email}</a> to ask what we hold about you or to have it deleted.</li>
      </ul>

      <h2>Contact</h2>
      <p>The Bohemian Paradise, {contact.location}. <a href={`mailto:${contact.email}`}>{contact.email}</a> · {contact.phone}</p>
    </section>
  );
}

export function Terms() {
  return (
    <section className="section legal">
      <h1>Terms of service</h1>
      <p className="muted">Last updated {UPDATED}</p>
      <p>These terms apply to purchases from The Bohemian Paradise at tbp.onrender.com. By placing an order you agree to them.</p>

      <h2>Products</h2>
      <p>Originals are one of a kind; once sold they are gone. Prints are made to order in the sizes shown. Colours on screen can differ slightly from the finished piece. Frames shown in previews are for illustration only and are not included unless stated.</p>

      <h2>Orders and payment</h2>
      <p>An order reserves the piece for a limited time while you pay. For UPI or bank transfer we confirm the order once the payment reaches us, normally within 24 hours; if payment does not arrive in time the piece goes back on sale and the order is cancelled. Card payments are processed by Stripe. Prices are in Indian rupees.</p>

      <h2>Shipping</h2>
      <p>We ship across India, packed by hand, usually within 3–5 working days of payment. Tracking details appear on your order page when the parcel leaves. Delivery times depend on the courier.</p>

      <h2>Cancellations and returns</h2>
      <p>You can cancel an unpaid order yourself from your order page. After payment, contact us before the piece ships and we will refund you. If a piece arrives damaged, email us photos within 48 hours of delivery and we will replace it or refund you.</p>

      <h2>Copyright</h2>
      <p>All artwork and images on this site are the artist's copyright. Buying a piece gives you ownership of that physical piece, not the right to reproduce it.</p>

      <h2>Contact</h2>
      <p><a href={`mailto:${contact.email}`}>{contact.email}</a> · {contact.phone} · {contact.location}</p>
    </section>
  );
}
