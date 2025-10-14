import React, { useState } from 'react';

// Helper components
const CodeBlock = ({ children }) => (
  <pre className="bg-gray-900 text-green-400 p-4 rounded-lg overflow-x-auto text-sm">
    <code>{children}</code>
  </pre>
);

const FunctionCard = ({ title, description, access, steps, tips }) => (
  <div className="border border-gray-200 rounded-lg p-6 bg-white shadow-sm mb-6">
    <div className="flex items-start justify-between mb-4">
      <h3 className="text-xl font-semibold text-gray-900">{title}</h3>
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
        access === 'viewer' ? 'bg-blue-100 text-blue-800' :
        access === 'book_worm' ? 'bg-green-100 text-green-800' :
        access === 'cataloger' ? 'bg-yellow-100 text-yellow-800' :
        'bg-red-100 text-red-800'
      }`}>
        {access} +
      </span>
    </div>
    
    <p className="text-gray-700 mb-6">{description}</p>
    
    {steps && (
      <div className="mb-6">
        <h4 className="font-medium text-gray-900 mb-3">📋 Step-by-Step:</h4>
        <ol className="list-decimal pl-6 space-y-2">
          {steps.map((step, index) => (
            <li key={index} className="text-gray-700">{step}</li>
          ))}
        </ol>
      </div>
    )}
    
    {tips && (
      <div>
        <h4 className="font-medium text-gray-900 mb-3">💡 Tips & Tricks:</h4>
        <ul className="list-disc pl-6 space-y-1">
          {tips.map((tip, index) => (
            <li key={index} className="text-gray-600 text-sm">{tip}</li>
          ))}
        </ul>
      </div>
    )}
  </div>
);

// Content components for each section
const SystemOverviewContent = () => (
  <div className="space-y-6">
    <h2 className="text-2xl font-bold text-gray-900">🏛️ System Overview</h2>
    <div className="space-y-4">
      <p className="text-gray-700">
        The Storage App is a dual-purpose system designed to manage both <strong>physical storage</strong> 
        and <strong>MARC catalog records</strong> for government document collections.
      </p>
      
      <h3 className="text-lg font-semibold text-gray-900">Key Features:</h3>
      <ul className="list-disc pl-6 space-y-2 text-gray-700">
        <li><strong>Physical Storage Management:</strong> Track items with precise shelf addressing</li>
        <li><strong>MARC Cataloging:</strong> Edit and create government document catalog records</li>
        <li><strong>Analytics Integration:</strong> Link physical items to ILS metadata</li>
        <li><strong>Weeding Operations:</strong> Track removed items and reclaim storage space</li>
      </ul>

      <h3 className="text-lg font-semibold text-gray-900">Call Number Format:</h3>
      <CodeBlock>
{`S-{floor}-{range}-{ladder}-{shelf}-{position}

Example: S-3-01B-02-03-001
- Floor: 3
- Range: 01B  
- Ladder: 02
- Shelf: 03
- Position: 001`}
      </CodeBlock>
    </div>
  </div>
);

const UserRolesContent = () => (
  <div className="space-y-6">
    <h2 className="text-2xl font-bold text-gray-900">👥 User Roles & Permissions</h2>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="border border-gray-200 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-blue-600 mb-2">Viewer</h3>
        <ul className="list-disc pl-4 text-sm text-gray-700 space-y-1">
          <li>Search items and analytics</li>
          <li>View catalog records</li>
          <li>Access documentation</li>
        </ul>
      </div>
      
      <div className="border border-gray-200 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-green-600 mb-2">Book Worm</h3>
        <ul className="list-disc pl-4 text-sm text-gray-700 space-y-1">
          <li>All Viewer permissions</li>
          <li>Upload item files</li>
          <li>Access empty slots for accessioning</li>
          <li>Generate accession labels and Excel files</li>
        </ul>
      </div>
      
      <div className="border border-gray-200 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-yellow-600 mb-2">Cataloger</h3>
        <ul className="list-disc pl-4 text-sm text-gray-700 space-y-1">
          <li>All Book Worm permissions</li>
          <li>Edit and create MARC records</li>
          <li>Manage boundwith relationships</li>
          <li>Handle weeding operations</li>
          <li>Manage analytics errors</li>
        </ul>
      </div>
      
      <div className="border border-gray-200 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-red-600 mb-2">Admin</h3>
        <ul className="list-disc pl-4 text-sm text-gray-700 space-y-1">
          <li>All Cataloger permissions</li>
          <li>User management</li>
          <li>View user activity logs</li>
          <li>System administration</li>
        </ul>
      </div>
    </div>
  </div>
);

const SearchFunctionsContent = () => (
  <div className="space-y-6">
    <h2 className="text-2xl font-bold text-gray-900">🔍 Search Functions</h2>
    
    <FunctionCard
      title="Item Search"
      description="Search for physical items in the storage system by barcode, call number, or location components."
      access="viewer"
      steps={[
        "Navigate to Searches → Item Search",
        "Enter search criteria (barcode, call number, or use filters)",
        "Select location filters (floor, range, ladder, shelf) as needed",
        "Click 'Search Items' to view results",
        "Export results as CSV if needed"
      ]}
      tips={[
        "Use partial matches - you don't need the complete barcode or call number",
        "Combine text search with location filters for precise results",
        "Results show analytics data (title, status) when available",
        "Empty searches with only filters will show all items in that location"
      ]}
    />

    <FunctionCard
      title="Analytics Search"
      description="Search ILS analytics data to find items that exist in the library system."
      access="viewer"
      steps={[
        "Navigate to Searches → Analytics Search",
        "Enter search criteria (title, barcode, call numbers)",
        "Use dropdown filters for exact matches (policy, location, status)",
        "Click 'Search Analytics' to view results",
        "Export results as CSV for further analysis"
      ]}
      tips={[
        "Title searches are powerful - use keywords from document titles",
        "Use status filters to find items that need attention",
        "Analytics data comes from your ILS system",
        "Missing analytics often indicate items that need cataloging"
      ]}
    />

    <FunctionCard
      title="Analytics Errors"
      description="Review and resolve discrepancies between physical items and ILS analytics data."
      access="cataloger"
      steps={[
        "Navigate to Searches → Analytics Errors",
        "Review error list showing discrepancies",
        "Filter by error type or barcode as needed",
        "Investigate each error to determine cause",
        "Resolve errors by updating records or physical items",
        "Re-run analytics sync to verify fixes"
      ]}
      tips={[
        "Errors often indicate items that need attention",
        "Check both physical location and digital records",
        "Common fixes: update barcodes, correct call numbers, add missing records",
        "Regular error review keeps inventory accurate"
      ]}
    />
  </div>
);

const StorageManagementContent = () => (
  <div className="space-y-6">
    <h2 className="text-2xl font-bold text-gray-900">📦 Storage Management</h2>
    
    <FunctionCard
      title="Empty Slots"
      description="View all available storage locations in the system, including empty slots, shelves, and positions freed by weeding."
      access="viewer"
      steps={[
        "Navigate to Accessioning → Empty Slots",
        "View automatically generated list of available storage",
        "Filter by range if you need specific areas",
        "Note the three types: empty slots, empty shelves, destroyed slots",
        "Use this information for planning new acquisitions"
      ]}
      tips={[
        "Empty slots = individual positions within occupied shelves",
        "Empty shelves = entire shelves available for items",
        "Destroyed slots = positions freed by weeding operations",
        "List updates automatically as items are added/removed"
      ]}
    />

    <FunctionCard
      title="Accession from Slots"
      description="Generate storage locations and barcodes for new items entering the collection."
      access="book_worm"
      steps={[
        "Navigate to Accessioning → Accession From Slots",
        "Choose between 'slots' (individual positions) or 'shelves' (full shelves)",
        "Set quantity needed and items per shelf (if using shelves)",
        "Optionally set call number range to limit to specific areas",
        "Click 'Fetch Slots/Shelves' to get available locations",
        "Add barcodes for each item in the generated list",
        "Generate Excel file for record keeping",
        "Generate labels for physical items"
      ]}
      tips={[
        "Use range filtering for organized placement of related materials",
        "Generate Excel files for batch processing in your ILS",
        "Print labels immediately after generating for best workflow",
        "Verify all barcodes are entered before generating files"
      ]}
    />
  </div>
);

const DataManagementContent = () => (
  <div className="space-y-6">
    <h2 className="text-2xl font-bold text-gray-900">📊 Data Management</h2>
    
    <FunctionCard
      title="Manage Records"
      description="Generic CRUD operations for all database tables. Search, view, create, update, and delete records across the system."
      access="cataloger"
      steps={[
        "Navigate to Record Editing → Manage Records",
        "Select table type (items, analytics, weeded_items, analytics_errors)",
        "Use search filters to find specific records",
        "View record details by clicking on entries",
        "Create new records using the create form",
        "Edit existing records with update functionality",
        "Delete records when necessary (use caution)"
      ]}
      tips={[
        "Use specific search criteria to avoid overwhelming results",
        "Always backup important data before bulk deletions",
        "Check for dependencies before deleting records",
        "Use pagination controls for large result sets"
      ]}
    />

    <FunctionCard
      title="Upload Files"
      description="Bulk upload Excel files to populate database tables with items, analytics data, and other records."
      access="book_worm"
      steps={[
        "Navigate to Record Editing → Upload Files",
        "Prepare Excel file with correct column headers",
        "Select appropriate upload type (Items, Analytics, etc.)",
        "Choose your prepared Excel file",
        "Review upload preview if available",
        "Confirm upload and wait for processing",
        "Review results and error messages"
      ]}
      tips={[
        "Always use the exact column names required by the system",
        "Remove empty rows and columns before uploading",
        "Check for duplicate barcodes in your data",
        "Start with small test files to verify format"
      ]}
    />

    <FunctionCard
      title="Weeding Operations"
      description="Process lists of items to be removed from the collection, automatically freeing up storage slots for new items."
      access="cataloger"
      steps={[
        "Prepare Excel file with items to be weeded",
        "Include alternative_call_number, barcode, and scanned_barcode columns",
        "Navigate to weeding upload function",
        "Upload the prepared Excel file",
        "Review processing results",
        "Verify that weeded items no longer appear in searches",
        "Check that destroyed slots become available in empty slots list"
      ]}
      tips={[
        "Double-check items before weeding - this process removes items from inventory",
        "Scanned_barcode helps verify items are physically removed",
        "Weeded items automatically create available storage slots",
        "Keep records of weeded items for collection development analysis"
      ]}
    />
  </div>
);

const CatalogingContent = () => (
  <div className="space-y-6">
    <h2 className="text-2xl font-bold text-gray-900">📚 Document Cataloging</h2>
    
    <FunctionCard
      title="SuDoc Records"
      description="Search and browse MARC catalog records for government documents from the Catalog of Government Publications (CGP)."
      access="viewer"
      steps={[
        "Navigate to Document Cataloging → SuDoc Records",
        "Enter search terms (SuDoc number, title, OCLC number)",
        "Browse search results",
        "Click on records to view detailed MARC fields",
        "Use advanced search features for precise results",
        "Export records as needed"
      ]}
      tips={[
        "SuDoc numbers follow Superintendent of Documents classification",
        "Search by partial SuDoc numbers for related documents",
        "OCLC numbers provide unique identification for WorldCat records",
        "Records may have local edits that override original CGP data"
      ]}
    />

    <FunctionCard
      title="SuDoc Editor"
      description="Edit existing MARC records and create new host records for government document collections."
      access="cataloger"
      steps={[
        "Find the record you want to edit in SuDoc Records",
        "Click 'Edit' to open the MARC editor",
        "Modify fields as needed using MARC format",
        "Add/remove fields and subfields",
        "Save changes (creates edited version in PostgreSQL)",
        "Review changes in record display"
      ]}
      tips={[
        "Edited records are stored separately from originals",
        "System shows edited versions by default",
        "Follow MARC21 standards for field formatting",
        "Use proper indicators and subfield codes"
      ]}
    />

    <FunctionCard
      title="Boundwith Operations"
      description="Create and manage relationships between documents that are physically bound together in the same volume."
      access="cataloger"
      steps={[
        "Identify documents that are physically bound together",
        "Search for existing component records",
        "Choose to use existing host record or create new one",
        "If creating new host: provide title, publisher, subjects",
        "Link component records to host using 773/774 fields",
        "Add holdings and item information",
        "Save the boundwith relationship"
      ]}
      tips={[
        "Host record represents the physical bound volume",
        "Component records are individual documents within the volume",
        "773 fields link components to host",
        "774 fields link host to components",
        "One physical item can contain multiple intellectual works"
      ]}
    />
  </div>
);

const AdminToolsContent = () => (
  <div className="space-y-6">
    <h2 className="text-2xl font-bold text-gray-900">⚙️ Admin Tools</h2>
    
    <FunctionCard
      title="User Management"
      description="Create, edit, and delete user accounts. Assign roles and manage user access to system functions."
      access="admin"
      steps={[
        "Navigate to Admin Tools → User Management",
        "View list of existing users and their roles",
        "Click 'Add User' to create new account",
        "Enter username, password, and select role",
        "Save new user account",
        "Edit existing users by clicking on their entries",
        "Delete users when necessary (removes all access)"
      ]}
      tips={[
        "Choose roles carefully - they determine system access",
        "Use strong passwords for all accounts",
        "Regularly review user list and remove inactive accounts",
        "Consider role requirements before assigning permissions"
      ]}
    />

    <FunctionCard
      title="User Activity Logs"
      description="Monitor and audit all user activity in the system. Track API access, user actions, and system usage patterns."
      access="admin"
      steps={[
        "Navigate to Admin Tools → User Logs",
        "Use filters to narrow down log entries (user, path, method, status)",
        "Set appropriate limit for number of logs to retrieve",
        "Click 'Search Logs' to view activity",
        "Review timestamps, users, and actions",
        "Export logs as CSV for external analysis",
        "Use pagination to navigate through large result sets"
      ]}
      tips={[
        "Filter by specific users to track individual activity",
        "Use path filters to monitor specific system functions",
        "Status codes help identify errors and successful operations",
        "Export logs regularly for security auditing"
      ]}
    />
  </div>
);

const TroubleshootingContent = () => (
  <div className="space-y-6">
    <h2 className="text-2xl font-bold text-gray-900">🛠️ Troubleshooting Guide</h2>
    
    <div className="space-y-4">
      <div className="border-l-4 border-red-400 bg-red-50 p-4 rounded-r-lg">
        <h4 className="font-semibold text-red-800 mb-2">🚫 Upload Failures</h4>
        <div className="text-red-700 text-sm space-y-1">
          <p><strong>Problem:</strong> Excel files fail to upload or process</p>
          <p><strong>Solutions:</strong></p>
          <ul className="list-disc pl-4">
            <li>Check column names match exactly (case-sensitive)</li>
            <li>Remove empty rows and columns</li>
            <li>Verify call number format: S-floor-range-ladder-shelf-position</li>
            <li>Check for duplicate barcodes</li>
            <li>Ensure file is .xlsx or .xls format</li>
          </ul>
        </div>
      </div>

      <div className="border-l-4 border-yellow-400 bg-yellow-50 p-4 rounded-r-lg">
        <h4 className="font-semibold text-yellow-800 mb-2">📦 Empty Slots Not Appearing</h4>
        <div className="text-yellow-700 text-sm space-y-1">
          <p><strong>Problem:</strong> Expected empty slots don't show in the list</p>
          <p><strong>Solutions:</strong></p>
          <ul className="list-disc pl-4">
            <li>Verify items are properly weeded in the system</li>
            <li>Check that weeding operations have been processed</li>
            <li>Refresh the empty slots view</li>
            <li>Verify call number format of weeded items</li>
          </ul>
        </div>
      </div>

      <div className="border-l-4 border-blue-400 bg-blue-50 p-4 rounded-r-lg">
        <h4 className="font-semibold text-blue-800 mb-2">🔍 Search Results Missing</h4>
        <div className="text-blue-700 text-sm space-y-1">
          <p><strong>Problem:</strong> Expected items don't appear in search results</p>
          <p><strong>Solutions:</strong></p>
          <ul className="list-disc pl-4">
            <li>Check spelling and use partial matches</li>
            <li>Verify items exist in the correct database table</li>
            <li>Clear all filters and search again</li>
            <li>Check if items were accidentally deleted or weeded</li>
            <li>Use Analytics Errors to identify missing links</li>
          </ul>
        </div>
      </div>

      <div className="border-l-4 border-green-400 bg-green-50 p-4 rounded-r-lg">
        <h4 className="font-semibold text-green-800 mb-2">📚 MARC Record Issues</h4>
        <div className="text-green-700 text-sm space-y-1">
          <p><strong>Problem:</strong> MARC records not displaying or editing properly</p>
          <p><strong>Solutions:</strong></p>
          <ul className="list-disc pl-4">
            <li>Check if record exists in both SQLite and PostgreSQL</li>
            <li>Verify MARC field formatting (tags, indicators, subfields)</li>
            <li>Check for special characters or encoding issues</li>
            <li>Ensure proper MARC21 format compliance</li>
            <li>Review edited vs. original record status</li>
          </ul>
        </div>
      </div>

      <div className="border-l-4 border-purple-400 bg-purple-50 p-4 rounded-r-lg">
        <h4 className="font-semibold text-purple-800 mb-2">🔐 Permission Errors</h4>
        <div className="text-purple-700 text-sm space-y-1">
          <p><strong>Problem:</strong> "Access denied" or "Insufficient permissions" messages</p>
          <p><strong>Solutions:</strong></p>
          <ul className="list-disc pl-4">
            <li>Check your user role and required permissions</li>
            <li>Log out and log back in to refresh session</li>
            <li>Contact admin to verify your role assignment</li>
            <li>Clear browser cache and cookies</li>
          </ul>
        </div>
      </div>
    </div>

    <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 mt-8">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">📞 Getting Help</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-gray-700">
        <div>
          <h4 className="font-medium text-gray-900 mb-2">Before Contacting Support:</h4>
          <ul className="list-disc pl-4 space-y-1">
            <li>Note exact error messages</li>
            <li>Record steps to reproduce the issue</li>
            <li>Check your user role and permissions</li>
            <li>Try the solution in a different browser</li>
          </ul>
        </div>
        <div>
          <h4 className="font-medium text-gray-900 mb-2">Information to Provide:</h4>
          <ul className="list-disc pl-4 space-y-1">
            <li>Your username and role</li>
            <li>Time when issue occurred</li>
            <li>Browser and operating system</li>
            <li>Specific function or page affected</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
);

// Main Documentation component with wiki-style navigation
export default function Documentation() {
  const [activeSection, setActiveSection] = useState('overview');

  const sections = [
    { id: 'overview', title: 'System Overview', component: SystemOverviewContent },
    { id: 'roles', title: 'User Roles & Permissions', component: UserRolesContent },
    { id: 'search', title: 'Search Functions', component: SearchFunctionsContent },
    { id: 'storage', title: 'Storage Management', component: StorageManagementContent },
    { id: 'data', title: 'Data Management', component: DataManagementContent },
    { id: 'cataloging', title: 'Document Cataloging', component: CatalogingContent },
    { id: 'admin', title: 'Admin Tools', component: AdminToolsContent },
    { id: 'troubleshooting', title: 'Troubleshooting', component: TroubleshootingContent },
  ];

  const ActiveComponent = sections.find(s => s.id === activeSection)?.component;

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">📖 Storage App Documentation</h1>
        <p className="text-lg text-gray-600">
          Comprehensive guide to all functions and features in the Government Documents Library Management System
        </p>
      </div>



      <div className="flex flex-col lg:flex-row gap-8">
        {/* Navigation Sidebar */}
        <div className="lg:w-1/4">
          <div className="bg-white rounded-lg shadow-sm border sticky top-4">
            <div className="p-4 border-b">
              <h2 className="font-semibold text-gray-900">Contents</h2>
            </div>
            <nav className="p-2">
              {sections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                    activeSection === section.id
                      ? 'bg-blue-100 text-blue-700 font-medium'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {section.title}
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Content Area */}
        <div className="lg:w-3/4">
          <div className="bg-white rounded-lg shadow-sm border">
            <div className="p-6">
              {ActiveComponent && <ActiveComponent />}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 p-6 bg-gray-50 rounded-lg">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">📞 Need Help?</h2>
        <p className="text-gray-700 mb-2">
          This documentation covers all major functions of the Storage App. If you need additional assistance:
        </p>
        <ul className="list-disc pl-6 text-gray-700 space-y-1">
          <li>Check the Troubleshooting section for common issues</li>
          <li>Review your user role and permissions</li>
          <li>Contact your system administrator for technical support</li>
          <li>Submit feature requests through your organization's process</li>
        </ul>
        <p className="text-sm text-gray-500 mt-4">
          Last updated: {new Date().toLocaleDateString()} • Version 1.0
        </p>
      </div>
    </div>
  );
}