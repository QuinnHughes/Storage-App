// src/components/Layout.jsx
import { Link, Outlet } from 'react-router-dom';

export default function Layout() {
  return (
    <div>
      <nav style={{ padding: '1rem', background: '#eee' }}>
        <Link to="/" style={{ marginRight: '1rem' }}>Dashboard</Link>
        <Link to="/shelf-viewer" style={{ marginRight: '1rem' }}>Shelf Viewer</Link>
        <Link to="/item-manager" style={{ marginRight: '1rem' }}>Item Manager</Link>
        <Link to="/analytics-manager" style={{ marginRight: '1rem' }}>Analytics Manager</Link>
        <Link to="/search" style={{ marginRight: '1rem' }}>Search</Link>
        <Link to="/compare" style={{ marginRight: '1rem' }}>Compare</Link>
        <Link to="/review-needed" style={{ marginRight: '1rem' }}>Review Needed</Link>
        <Link to="/admin/edit">Admin Edit</Link>
      </nav>
      <main style={{ padding: '1rem' }}>
        <Outlet />
      </main>
    </div>
  );
}
