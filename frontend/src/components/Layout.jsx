import { useEffect, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useStore } from "../store";
import { contact } from "../data";

export const Icon = {
  cart: (p) => (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M6 7h14l-1.5 9H7.5L6 7Z" /><path d="M6 7 5 4H2" /><circle cx="9" cy="20" r="1.2" /><circle cx="17" cy="20" r="1.2" />
    </svg>
  ),
  search: (p) => (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...p}>
      <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
    </svg>
  ),
  user: (p) => (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" {...p}>
      <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-6 8-6s8 2 8 6" />
    </svg>
  ),
  menu: (p) => (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...p}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  ),
  chevron: (p) => (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  ),
  check: (p) => (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="m5 12 4 4L19 6" />
    </svg>
  ),
  x: (p) => (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...p}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  ),
};

function Navbar() {
  const { user, logout, cartCount } = useStore();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const submitSearch = (e) => {
    e.preventDefault();
    setOpen(false);
    navigate(q.trim() ? `/products?q=${encodeURIComponent(q.trim())}` : "/products");
  };

  return (
    <header className="nav">
      <div className="nav__inner">
        <button className="nav__burger" aria-label="Menu" onClick={() => setOpen((o) => !o)}>
          {open ? <Icon.x /> : <Icon.menu />}
        </button>
        <form className="nav__search" onSubmit={submitSearch} role="search">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search paintings" aria-label="Search" />
          <button type="submit" aria-label="Search"><Icon.search /></button>
        </form>
        <Link to="/" className="nav__brand">The Bohemian Paradise</Link>
        <div className="nav__right">
          <nav className={`nav__links ${open ? "is-open" : ""}`} onClick={() => setOpen(false)}>
            <NavLink to="/products">Shop</NavLink>
            {user ? (
              <>
                <NavLink to="/orders">Orders</NavLink>
                <NavLink to="/account" className="nav__icon" title={user.name}><Icon.user /><span className="nav__name">{user.name.split(" ")[0]}</span></NavLink>
                <button className="nav__text" onClick={logout}>Sign out</button>
              </>
            ) : (
              <>
                <NavLink to="/register">Register</NavLink>
                <NavLink to="/login">Sign in</NavLink>
              </>
            )}
          </nav>
          <NavLink to="/cart" className="nav__icon nav__cart" aria-label={`Bag, ${cartCount} items`}>
            <Icon.cart />
            {cartCount > 0 && <span className="nav__badge">{cartCount}</span>}
          </NavLink>
        </div>
      </div>
      {open && <div className="nav__scrim" onClick={() => setOpen(false)} />}
    </header>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div className="footer__col">
        <h3 className="footer__brand">The Bohemian Paradise</h3>
        <p>Original paintings and limited prints by an independent artist in New Delhi. Every piece is packed by hand and shipped across India.</p>
        <div className="footer__social">
          <a href={contact.instagram} target="_blank" rel="noreferrer" aria-label="Instagram">Instagram</a>
        </div>
      </div>
      <div className="footer__col">
        <h4>Shop</h4>
        <ul>
          <li><Link to="/products">All artwork</Link></li>
          <li><Link to="/products?inStock=1">Available now</Link></li>
          <li><Link to="/products?sort=newest">New arrivals</Link></li>
          <li><Link to="/cart">Your bag</Link></li>
          <li><Link to="/orders">Track an order</Link></li>
        </ul>
      </div>
      <div className="footer__col">
        <h4>Contact</h4>
        <ul className="footer__contact">
          <li>{contact.location}</li>
          <li><a href={`tel:${contact.phone.replace(/\s/g, "")}`}>{contact.phone}</a></li>
          <li><a href={`mailto:${contact.email}`}>{contact.email}</a></li>
        </ul>
      </div>
      <div className="footer__bottom">© {new Date().getFullYear()} The Bohemian Paradise</div>
    </footer>
  );
}

function Toast() {
  const { toast } = useStore();
  if (!toast) return null;
  return <div className={`toast toast--${toast.kind}`} role="status">{toast.message}</div>;
}

export default function Layout({ children }) {
  const { cart } = useStore();
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    setDismissed(false);
  }, [cart.problems.length]);
  return (
    <div className="app">
      <div className="announce">Free shipping on all orders across India</div>
      <Navbar />
      <main>{children}</main>
      <Footer />
      <Toast />
      {!dismissed && cart.problems.length > 0 && (
        <div className="cart-alert">
          <span>Some items in your bag changed. <Link to="/cart">Review your bag</Link></span>
          <button aria-label="Dismiss" onClick={() => setDismissed(true)}><Icon.x /></button>
        </div>
      )}
    </div>
  );
}
