import { Link, Outlet } from 'react-router-dom';
import './Layout.css';

const Layout = () => (
  <div className="layout">
    <nav className="sidebar">
      <h2>Storage App</h2>

      <h3><b>Getting Started</b></h3>
      <ul>
        <li><Link to="/login"> login</Link></li>
        <li><Link to="/">General Overview</Link></li>
      </ul>

      <h3><b>Searches</b></h3>
      <ul>
        <li><Link to="/item-search">Item Search</Link></li>
        <li><Link to="/analytics-search">Analytics Search</Link></li>
        <li><Link to="/analytics-errors">Analytics Errors</Link></li>
      </ul>
      <h3><b>Accessioning</b></h3>
      <ul>  
        <li><Link to="/empty-slots">Empty Slots</Link></li>
        <li><Link to="/accession-slots">Accession From Slots</Link></li>
        <li><Link to="/shelf-optimization">Shelf Optimization</Link></li>
        <li><Link to="/shelf-viewer">Shelf Viewer</Link></li>
      </ul>
      <h3><b>Record Editing</b></h3>
      <ul>
        <li><Link to="/manage-records">Manage Records</Link></li>
        <li><Link to="/combined-upload">Upload Files</Link></li>

      </ul>
      <h3><b>Document Cataloging</b></h3>
      <ul>
        <li><Link to="/sudoc-records">Sudoc Records</Link></li>
        <li><Link to="/sudoc-editor">Sudoc Editor</Link></li>
      </ul>

      <h3><b>Admin Tools</b></h3>
      <ul>
        <li><Link to="/documentation">Documentation</Link></li>
        <li><Link to ="/user-management">User Management</Link></li>
        <li><Link to="/user-logs">User Logs</Link></li>
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
