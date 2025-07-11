import { Link, Outlet } from 'react-router-dom';
import './Layout.css';

const Layout = () => (
  <div className="layout">
    <nav className="sidebar">
      <h2>Storage App</h2>

      <h3>Getting Started</h3>
      <ul>
        <li><Link to="/login"> login</Link></li>
        <li><Link to="/">General Overview</Link></li>
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
        <li><Link to="/create-items">Item Creator</Link></li>
        <li><Link to="/combined-upload">Upload Files</Link></li>
        <li><Link to="/review-needed">Review Needed</Link></li>
        <li><Link to="/sudoc-records">Sudoc Records</Link></li>
      </ul>

      <h3>Admin Section</h3>
      <ul>
        <li><Link to="/documentation">Documentation</Link></li>
      </ul>
    </nav>

    <main className="main-content">
      {/* removed max-w-screen-xl and mx-auto to allow full width */}
      <div className="px-4 sm:px-6 lg:px-8">
        <Outlet />
      </div>
    </main>
  </div>
);

export default Layout;
