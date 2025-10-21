import React, { useState, useEffect } from 'react';
import apiFetch from '../api/client';
import RecordViewerModal from './RecordViewerModal';

/**
 * ShelfRecordsViewer - Visual shelf representation showing all positions
 * 
 * Features:
 * - Position-based grid (shows all slots 1-50+)
 * - Color coding: Green for physical items, Blue for analytics
 * - Visual 35" shelf bar with items marked
 * - Click position to view record details
 * - Summary stats (items, empty slots, capacity)
 * 
 * @param {Object} props
 * @param {string} props.shelfCallNumber - Shelf identifier (e.g., S-3-01B-02-03)
 * @param {function} props.onClose - Close handler
 * @param {string} props.userRole - Current user role
 */
export default function ShelfRecordsViewer({ shelfCallNumber, onClose, userRole = 'viewer' }) {
  const [shelfData, setShelfData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [viewerOpen, setViewerOpen] = useState(false);

  useEffect(() => {
    if (shelfCallNumber) {
      fetchShelfData();
    }
  }, [shelfCallNumber]);

  const fetchShelfData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await apiFetch(`/records/shelf/${encodeURIComponent(shelfCallNumber)}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to load shelf data');
      }
      
      const data = await response.json();
      setShelfData(data);
    } catch (err) {
      console.error('Shelf fetch error:', err);
      setError(err.message || 'Failed to load shelf data');
    } finally {
      setLoading(false);
    }
  };

  const handleViewRecord = (recordType, recordId) => {
    setSelectedRecord({ type: recordType, id: recordId });
    setViewerOpen(true);
  };

  if (!shelfCallNumber) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p>No shelf selected</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-lg">
      {/* Header */}
      <div className="bg-purple-600 text-white px-6 py-4 flex justify-between items-center rounded-t-lg">
        <div>
          <h2 className="text-2xl font-bold">🗄️ Shelf Viewer</h2>
          <p className="text-purple-100 text-sm mt-1">
            Call Number: <span className="font-mono font-bold">{shelfCallNumber}</span>
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-white hover:bg-purple-700 rounded-full p-2 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Content */}
      <div className="p-6">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
            {error}
          </div>
        )}

        {shelfData && !loading && (
          <>
            {/* Summary Stats */}
            <ShelfSummary shelfData={shelfData} />

            {/* Visual Shelf Bar */}
            <ShelfVisualBar shelfData={shelfData} />

            {/* Position Grid */}
            <PositionGrid 
              shelfData={shelfData} 
              onViewRecord={handleViewRecord}
            />
          </>
        )}
      </div>

      {/* Record Viewer Modal */}
      {selectedRecord && (
        <RecordViewerModal
          isOpen={viewerOpen}
          onClose={() => {
            setViewerOpen(false);
            setSelectedRecord(null);
          }}
          recordType={selectedRecord.type}
          recordId={selectedRecord.id}
          userRole={userRole}
          onDelete={() => {
            // Refresh shelf data after delete
            fetchShelfData();
            setViewerOpen(false);
            setSelectedRecord(null);
          }}
          onEdit={() => {
            // Refresh shelf data after edit
            fetchShelfData();
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shelf Summary Component
// ─────────────────────────────────────────────────────────────────────────────
function ShelfSummary({ shelfData }) {
  const { physical_items = [], analytics_neighbors = [], weeded = [], summary = {} } = shelfData;
  
  const physicalCount = physical_items.length;
  const analyticsCount = analytics_neighbors.length;
  const weededCount = weeded?.length || summary.total_weeded || 0;
  
  // Calculate capacity based on actual usage:
  // If we have weeded items, capacity = current + weeded
  // Otherwise, capacity = current (shelf is full)
  const maxPosition = Math.max(
    ...physical_items.map(item => parseInt(item.position) || 0),
    0
  );
  
  let totalSlots, emptySlots, capacityPercent;
  
  if (weededCount > 0) {
    // Shelf had items removed, so we know there's empty space
    totalSlots = physicalCount + weededCount;
    emptySlots = weededCount;
    capacityPercent = Math.round((physicalCount / totalSlots) * 100);
  } else {
    // No weeding = assume shelf is full to its current extent
    totalSlots = maxPosition || physicalCount;
    emptySlots = 0;
    capacityPercent = 100;
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="text-sm text-green-600 font-medium">Physical Items</div>
        <div className="text-3xl font-bold text-green-900">{physicalCount}</div>
      </div>
      
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="text-sm text-blue-600 font-medium">Analytics Records</div>
        <div className="text-3xl font-bold text-blue-900">{analyticsCount}</div>
      </div>
      
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="text-sm text-gray-600 font-medium">Empty Slots</div>
        <div className="text-3xl font-bold text-gray-900">{emptySlots}</div>
        {weededCount > 0 && (
          <div className="text-xs text-gray-500 mt-1">({weededCount} weeded)</div>
        )}
      </div>
      
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
        <div className="text-sm text-purple-600 font-medium">Capacity</div>
        <div className="text-3xl font-bold text-purple-900">{capacityPercent}%</div>
        {weededCount === 0 && (
          <div className="text-xs text-purple-600 mt-1">(Assumed full)</div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Visual Shelf Bar Component
// ─────────────────────────────────────────────────────────────────────────────
function ShelfVisualBar({ shelfData }) {
  const { physical_items = [], analytics_neighbors = [], errors = [], weeded = [] } = shelfData;
  
  // Create position map - prioritize analytics since items table is mostly empty
  const positionMap = {};
  
  // First add analytics records (these are the actual occupied positions)
  analytics_neighbors.forEach(item => {
    if (item.call_number) {
      const position = item.call_number.split('-').pop();
      const pos = parseInt(position);
      if (!positionMap[pos]) {
        positionMap[pos] = { items: [], analytics: [], hasItem: false };
      }
      positionMap[pos].analytics.push(item);
    }
  });
  
  // Then overlay physical items if they exist
  physical_items.forEach(item => {
    if (item.position) {
      const pos = parseInt(item.position);
      if (!positionMap[pos]) {
        positionMap[pos] = { items: [], analytics: [], hasItem: false };
      }
      positionMap[pos].items.push(item);
      positionMap[pos].hasItem = true;
    }
  });

  // Create error position set
  const errorPositions = new Set();
  errors.forEach(error => {
    if (error.analytics_call_number) {
      const position = error.analytics_call_number.split('-').pop();
      if (position) {
        errorPositions.add(parseInt(position));
      }
    }
  });

  const totalSlots = 35; // 35" shelf width = 35 positions
  const slots = Array.from({ length: totalSlots }, (_, i) => i + 1);

  return (
    <div className="mb-6">
      <h3 className="font-bold text-lg mb-3">Visual Shelf (35" width)</h3>
      <div className="bg-gray-100 rounded-lg p-4">
        <div className="flex items-center gap-1">
          {slots.map(position => {
            const posData = positionMap[position];
            const hasError = errorPositions.has(position);
            const hasAnalytics = posData && posData.analytics.length > 0;
            const hasItem = posData && posData.hasItem;
            const hasDuplicate = posData && posData.analytics.length > 1;
            
            let colorClass = 'bg-gray-300';
            let hoverClass = '';
            let tooltip = `Position ${position}: Empty`;
            
            // Errors take priority - show red
            if (hasError) {
              colorClass = 'bg-red-500';
              hoverClass = 'hover:bg-red-600 cursor-pointer';
              tooltip = `Position ${position}: ERROR - Analytics mismatch`;
            } else if (hasDuplicate) {
              colorClass = 'bg-orange-500';
              hoverClass = 'hover:bg-orange-600 cursor-pointer';
              tooltip = `Position ${position}: DUPLICATE - ${posData.analytics.length} analytics records`;
            } else if (hasItem) {
              // Has physical item - confirmed/accessioned
              colorClass = 'bg-green-500';
              hoverClass = 'hover:bg-green-600 cursor-pointer';
              const title = posData.analytics[0]?.title || posData.items[0]?.title || posData.items[0]?.barcode;
              tooltip = `Position ${position}: Accessioned (${title})`;
            } else if (hasAnalytics) {
              // Has analytics but no physical item yet - pending accession
              colorClass = 'bg-blue-500';
              hoverClass = 'hover:bg-blue-600 cursor-pointer';
              tooltip = `Position ${position}: Pending Accession (${posData.analytics[0].title || posData.analytics[0].barcode})`;
            }
            
            return (
              <div
                key={position}
                className={`h-12 flex-1 rounded transition-all ${colorClass} ${hoverClass}`}
                title={tooltip}
              />
            );
          })}
        </div>
        <div className="flex justify-between text-xs text-gray-500 mt-2">
          <span>Position 1</span>
          <span>Position {totalSlots}</span>
        </div>
      </div>
      
      {/* Legend */}
      <div className="flex gap-6 mt-3 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-green-500 rounded"></div>
          <span>Accessioned (Has Physical Item)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-blue-500 rounded"></div>
          <span>Pending Accession (Analytics Only)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-red-500 rounded"></div>
          <span>Error</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-orange-500 rounded"></div>
          <span>Duplicate</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-gray-300 rounded"></div>
          <span>Empty</span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Position Grid Component
// ─────────────────────────────────────────────────────────────────────────────
function PositionGrid({ shelfData, onViewRecord }) {
  const { physical_items = [], analytics_neighbors = [] } = shelfData;
  
  // Create position map for physical items
  const positionMap = {};
  physical_items.forEach(item => {
    if (item.position) {
      positionMap[parseInt(item.position)] = item;
    }
  });

  const totalSlots = 50;
  const slots = Array.from({ length: totalSlots }, (_, i) => i + 1);

  return (
    <div>
      <h3 className="font-bold text-lg mb-3">Position Details</h3>
      
      {/* Physical Items Table */}
      {physical_items.length > 0 && (
        <div className="mb-6">
          <h4 className="font-semibold text-md mb-2 text-green-700">📦 Physical Items</h4>
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-green-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Position</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Barcode</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Title</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Call Number</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {physical_items.map((item, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono text-sm font-bold">{item.position || '-'}</td>
                    <td className="px-3 py-2 font-mono text-sm">{item.barcode}</td>
                    <td className="px-3 py-2 text-sm">{item.title || '-'}</td>
                    <td className="px-3 py-2 font-mono text-xs">{item.call_number || '-'}</td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => onViewRecord('item', item.id)}
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Analytics Records Table */}
      {analytics_neighbors.length > 0 && (
        <div className="mb-6">
          <h4 className="font-semibold text-md mb-2 text-blue-700">📊 Analytics Records (Estimates)</h4>
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-blue-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Barcode</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Title</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Call Number</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-700">Status</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {analytics_neighbors.map((item, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono text-sm">{item.barcode}</td>
                    <td className="px-3 py-2 text-sm">{item.title || '-'}</td>
                    <td className="px-3 py-2 font-mono text-xs">{item.call_number || '-'}</td>
                    <td className="px-3 py-2 text-center">
                      {item.has_item_link ? (
                        <span className="text-green-600 text-xs">✅ Accessioned</span>
                      ) : (
                        <span className="text-gray-400 text-xs">⏳ Pending</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => onViewRecord('analytics', item.id)}
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Analytics Errors Section */}
      {shelfData.errors && shelfData.errors.length > 0 && (
        <div className="mb-6">
          <h4 className="font-semibold text-md mb-2 text-red-700">⚠️ Analytics Errors ({shelfData.errors.length})</h4>
          <div className="bg-red-50 border border-red-200 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-red-100">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Barcode</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Title</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Call Number</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Error Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-red-200">
                {shelfData.errors.map((error, idx) => (
                  <tr key={idx} className="hover:bg-red-100">
                    <td className="px-3 py-2 font-mono text-sm">{error.barcode}</td>
                    <td className="px-3 py-2 text-sm">{error.title || '-'}</td>
                    <td className="px-3 py-2 font-mono text-xs">{error.analytics_call_number || '-'}</td>
                    <td className="px-3 py-2 text-sm text-red-700">{error.error_reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty Shelf Message */}
      {physical_items.length === 0 && analytics_neighbors.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <p className="text-lg">📭 This shelf appears to be empty</p>
          <p className="text-sm mt-2">No physical items or analytics records found</p>
        </div>
      )}
    </div>
  );
}
