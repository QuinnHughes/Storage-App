import { Link, Outlet } from 'react-router-dom';
import './Layout.css';

const Layout = () => (
  <div className="layout">
    <nav className="sidebar">
      <h2>Storage App</h2>

      <h3>Getting Started</h3>
      <ul>
        <li><Link to="/">General Overview</Link></li>
        <li><Link to="/login"> login</Link></li>
      </ul>

      <h3>Searches</h3>
      <ul>
        <li><Link to="/empty-slots">Empty Slots</Link></li>
        <li><Link to="/item-search">Item Search</Link></li>
        <li><Link to="/analytics-search">Analytics Search</Link></li>
        <li><Link to="/analytics-errors">Analytics Errors</Link></li>
      </ul>

      <h3>Record Editing</h3>
      <ul>
        <li><Link to="/item-manager">Item Manager</Link></li>
        <li><Link to="/upload-items">Upload Items</Link></li>
        <li><Link to="/upload-analytics">Upload Analytics</Link></li>
        <li><Link to="/review-needed">Review Needed</Link></li>
        <li><Link to="/admin-edit">Admin Edit</Link></li>
      </ul>

      <h3>Admin Section</h3>
      <ul>
        <li><Link to="/documentation">Documentation</Link></li>
      </ul>

    </nav>

    <main className="main-content">
      {/* Center & constrain everything inside */}
      <div className="mx-auto max-w-screen-xl px-4 sm:px-6 lg:px-8">
        <Outlet />
      </div>
    </main>
  </div>
);

export default Layout;
