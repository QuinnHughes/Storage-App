import { Link, Outlet } from 'react-router-dom';
import './Layout.css';

const Layout = () => (
  <div className="layout">
    <nav className="sidebar">
      <h2>Storage App</h2>

      <h3>Searches</h3>
      <ul>
        <li><Link to="/shelf-viewer">Shelf Viewer</Link></li>
        <li><Link to="/item-search">Item Search</Link></li>
        <li><Link to="/analytics-search">Analytics Search</Link></li>
        <li><Link to="/compare">Compare</Link></li>
      </ul>

      <h3>Record Editing</h3>
      <ul>
        <li><Link to="/item-manager">Item Manager</Link></li>
        <li><Link to="/upload-items">Upload Items</Link></li>
        <li><Link to="/upload-analytics">Upload Analytics</Link></li>
        <li><Link to="/review-needed">Review Needed</Link></li>
        <li><Link to="/admin-edit">Admin Edit</Link></li>
      </ul>

      <h3>Documentation</h3>
      <ul>
        <li><Link to="/">Quick Start</Link></li>
      </ul>
    </nav>
    <main className="main-content">
      <Outlet />
    </main>
  </div>
);

export default Layout;
