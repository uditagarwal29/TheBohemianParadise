import { NavLink, Outlet, Navigate, Link } from "react-router-dom";
import { useStore } from "../store";

const links = [
  ["/admin", "Dashboard", true],
  ["/admin/products", "Products"],
  ["/admin/orders", "Orders"],
  ["/admin/customers", "Customers"],
];

export default function AdminLayout() {
  const { user, authReady, logout } = useStore();
  if (!authReady) return <div className="page-loading">Loading…</div>;
  if (!user) return <Navigate to="/login?next=/admin" replace />;
  if (!user.isAdmin) return <Navigate to="/" replace />;
  return (
    <div className="admin">
      <aside className="admin__side">
        <Link to="/" className="admin__brand">The Bohemian Paradise</Link>
        <span className="admin__tag">Studio admin</span>
        <nav>
          {links.map(([to, label, end]) => <NavLink key={to} to={to} end={end}>{label}</NavLink>)}
        </nav>
        <div className="admin__side-foot">
          <span className="muted small">{user.name}</span>
          <Link to="/" className="link">View shop</Link>
          <button className="link" onClick={logout}>Sign out</button>
        </div>
      </aside>
      <main className="admin__main">
        <Outlet />
      </main>
    </div>
  );
}
