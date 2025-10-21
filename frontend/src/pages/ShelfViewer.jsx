import React, { useState } from 'react';
import ShelfRecordsViewer from '../components/ShelfRecordsViewer';

/**
 * ShelfViewer Page - Search and view shelf contents
 * 
 * Allows users to:
 * - Enter a shelf call number to view contents
 * - See visual representation and position details
 * - Quick access to view individual records
 */
export default function ShelfViewer() {
  const [shelfCallNumber, setShelfCallNumber] = useState('');
  const [activeShelf, setActiveShelf] = useState(null);
  const [userRole, setUserRole] = useState('viewer');

  // Get user role from API on mount
  React.useEffect(() => {
    async function fetchUserRole() {
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          setUserRole('viewer');
          return;
        }
        const resp = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (resp.ok) {
          const userData = await resp.json();
          setUserRole(userData.role || 'viewer');
        }
      } catch (err) {
        console.error('Failed to fetch user role:', err);
        setUserRole('viewer');
      }
    }

    fetchUserRole();

    // Check URL for shelf parameter
    const params = new URLSearchParams(window.location.search);
    const shelfParam = params.get('shelf');
    if (shelfParam) {
      setShelfCallNumber(shelfParam);
      setActiveShelf(shelfParam);
    }
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    if (shelfCallNumber.trim()) {
      setActiveShelf(shelfCallNumber.trim());
    }
  };

  const handleClear = () => {
    setShelfCallNumber('');
    setActiveShelf(null);
  };

  return (
    <div className="max-w-7xl mx-auto p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">🗄️ Shelf Viewer</h1>
        <p className="text-gray-600">
          View the contents of any shelf, see position details, and manage items
        </p>
      </div>

      {/* Search Form */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <form onSubmit={handleSearch} className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Shelf Call Number
            </label>
            <input
              type="text"
              value={shelfCallNumber}
              onChange={(e) => setShelfCallNumber(e.target.value)}
              placeholder="e.g., S-3-01B-02-03"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 font-mono"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Format: S-floor-range-ladder-shelf (e.g., S-3-01B-02-03)
            </p>
          </div>
          
          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium transition-colors"
            >
              View Shelf
            </button>
            
            {activeShelf && (
              <button
                type="button"
                onClick={handleClear}
                className="px-6 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 font-medium transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Example Shelves */}
      {!activeShelf && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
          <h3 className="font-bold text-lg mb-3 text-blue-900">💡 Quick Examples</h3>
          <p className="text-sm text-blue-800 mb-3">
            Try viewing one of these shelves:
          </p>
          <div className="flex flex-wrap gap-2">
            {['S-3-01B-02-03', 'S-3-01B-02-04', 'S-3-01B-02-05'].map(example => (
              <button
                key={example}
                onClick={() => {
                  setShelfCallNumber(example);
                  setActiveShelf(example);
                }}
                className="px-4 py-2 bg-white border border-blue-300 rounded-lg hover:bg-blue-100 font-mono text-sm transition-colors"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Shelf Viewer Component */}
      {activeShelf && (
        <ShelfRecordsViewer
          shelfCallNumber={activeShelf}
          onClose={handleClear}
          userRole={userRole}
        />
      )}

      {/* Help Section */}
      {!activeShelf && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
          <h3 className="font-bold text-lg mb-3">📖 How to Use</h3>
          <ul className="space-y-2 text-sm text-gray-700">
            <li className="flex items-start gap-2">
              <span className="text-purple-600 font-bold">1.</span>
              <span>Enter a shelf call number in the format S-floor-range-ladder-shelf</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-purple-600 font-bold">2.</span>
              <span>Click "View Shelf" to see all items on that shelf</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-purple-600 font-bold">3.</span>
              <span>See a visual bar showing where items are positioned</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-purple-600 font-bold">4.</span>
              <span>Click "View" on any item to see full details</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-purple-600 font-bold">5.</span>
              <span>Use this to plan accessions, find empty slots, or audit shelf contents</span>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
