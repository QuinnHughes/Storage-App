// frontend/src/components/RecordViewerModal.jsx
import { useState, useEffect } from 'react';
import apiClient from '../api/client';
import RecordEditModal from './RecordEditModal';

/**
 * RecordViewerModal - Pyramid-style drill-down viewer for Analytics and Item records
 * 
 * Features:
 * - Tab-based interface: Details, Relationships, Shelf Context
 * - Role-based edit/delete buttons (hidden for viewers, not just disabled)
 * - Related record navigation (click to view related items/analytics)
 * - Shelf context with neighbors and physical position info
 * 
 * @param {Object} props
 * @param {boolean} props.isOpen - Modal visibility
 * @param {function} props.onClose - Close handler
 * @param {string} props.recordType - 'analytics' or 'item'
 * @param {number} props.recordId - ID to fetch
 * @param {function} props.onEdit - Optional callback when Edit clicked
 * @param {function} props.onDelete - Optional callback when Delete clicked
 * @param {string} props.userRole - Current user role (viewer/book_worm/cataloger/admin)
 */
export default function RecordViewerModal({
  isOpen,
  onClose,
  recordType,
  recordId,
  onEdit,
  onDelete,
  userRole = 'viewer'
}) {
  const [activeTab, setActiveTab] = useState('details');
  const [recordData, setRecordData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Determine if user can edit/delete based on role
  const canEditAnalytics = ['book_worm', 'cataloger', 'admin'].includes(userRole);
  const canEditItems = ['cataloger', 'admin'].includes(userRole);
  const canDelete = ['cataloger', 'admin'].includes(userRole);

  const canEdit = recordType === 'analytics' ? canEditAnalytics : canEditItems;

  useEffect(() => {
    if (isOpen && recordId) {
      fetchRecord();
    }
  }, [isOpen, recordId, recordType]);

  const fetchRecord = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient(`/records/${recordType}/${recordId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to load record');
      }
      const data = await response.json();
      setRecordData(data);
    } catch (err) {
      setError(err.message || 'Failed to load record');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = () => {
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = (updatedData) => {
    // Update the record data in the viewer
    setRecordData(prev => ({
      ...prev,
      record: { ...prev.record, ...updatedData }
    }));
    
    // Optionally call parent callback
    if (onEdit) {
      onEdit(updatedData);
    }
    
    // Refresh the full record to get updated relationships
    fetchRecord();
  };

  const handleDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete this ${recordType} record?`)) {
      return;
    }
    
    try {
      const response = await apiClient(`/records/${recordType}/${recordId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to delete record');
      }
      
      if (onDelete) {
        onDelete(recordId);
      }
      onClose();
    } catch (err) {
      alert(err.message || 'Failed to delete record');
    }
  };

  const handleViewRelated = (type, id) => {
    // Open a new viewer for the related record
    // This could be enhanced to stack modals or navigate
    setRecordData(null);
    fetchRecord(); // Placeholder - would need parent component to handle this
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white px-6 py-4 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold">
              {recordType === 'analytics' ? '📊 Analytics Record' : '📦 Physical Item'}
            </h2>
            <p className="text-blue-100 text-sm mt-1">
              ID: {recordId} {recordData?.record?.barcode && `• Barcode: ${recordData.record.barcode}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-blue-700 rounded-full p-2 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Action Buttons */}
        {recordData && (canEdit || canDelete) && (
          <div className="bg-gray-50 px-6 py-3 border-b flex gap-3">
            {canEdit && (
              <button
                onClick={handleEdit}
                className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit Record
              </button>
            )}
            {canDelete && (
              <button
                onClick={handleDelete}
                className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete
              </button>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="border-b px-6">
          <nav className="flex gap-4">
            <button
              onClick={() => setActiveTab('details')}
              className={`py-3 px-4 border-b-2 font-medium transition-colors ${
                activeTab === 'details'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              📋 Details
            </button>
            <button
              onClick={() => setActiveTab('relationships')}
              className={`py-3 px-4 border-b-2 font-medium transition-colors ${
                activeTab === 'relationships'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              🔗 Relationships
            </button>
            <button
              onClick={() => setActiveTab('shelf')}
              className={`py-3 px-4 border-b-2 font-medium transition-colors ${
                activeTab === 'shelf'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              🗄️ Shelf Context
            </button>
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {loading && (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
              {error}
            </div>
          )}

          {recordData && !loading && (
            <>
              {activeTab === 'details' && <DetailsTab recordData={recordData} recordType={recordType} />}
              {activeTab === 'relationships' && <RelationshipsTab recordData={recordData} recordType={recordType} />}
              {activeTab === 'shelf' && <ShelfContextTab recordData={recordData} recordType={recordType} />}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 border-t flex justify-end">
          <button
            onClick={onClose}
            className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-6 py-2 rounded-lg font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {/* Edit Modal */}
      {recordData && (
        <RecordEditModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          recordType={recordType}
          recordData={recordData.record}
          onSave={handleSaveEdit}
          userRole={userRole}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Details Tab - Show all record fields
// ─────────────────────────────────────────────────────────────────────────────
function DetailsTab({ recordData, recordType }) {
  const record = recordData.record;

  const formatFieldName = (key) => {
    return key
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const renderField = (key, value) => {
    if (value === null || value === undefined || value === '') return null;
    
    return (
      <div key={key} className="grid grid-cols-3 gap-4 py-3 border-b last:border-b-0">
        <div className="font-medium text-gray-700">{formatFieldName(key)}</div>
        <div className="col-span-2 text-gray-900 break-words">
          {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Key Fields - Highlighted */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-bold text-lg mb-3 text-blue-900">Key Information</h3>
        <div className="grid grid-cols-2 gap-4">
          {record.barcode && (
            <div>
              <span className="text-sm text-gray-600">Barcode</span>
              <div className="font-mono text-lg font-bold text-blue-900">{record.barcode}</div>
            </div>
          )}
          {record.alternative_call_number && (
            <div>
              <span className="text-sm text-gray-600">Call Number</span>
              <div className="font-mono text-lg font-bold text-blue-900">{record.alternative_call_number}</div>
            </div>
          )}
          {record.title && (
            <div className="col-span-2">
              <span className="text-sm text-gray-600">Title</span>
              <div className="font-semibold text-gray-900">{record.title}</div>
            </div>
          )}
        </div>
      </div>

      {/* All Fields */}
      <div className="bg-white border border-gray-200 rounded-lg">
        <div className="bg-gray-50 px-4 py-3 border-b">
          <h3 className="font-bold text-gray-900">All Fields</h3>
        </div>
        <div className="p-4">
          {Object.entries(record)
            .filter(([key]) => !['id', 'barcode', 'alternative_call_number', 'title'].includes(key))
            .map(([key, value]) => renderField(key, value))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Relationships Tab - Show related records
// ─────────────────────────────────────────────────────────────────────────────
function RelationshipsTab({ recordData, recordType }) {
  const { related_item, related_analytics, related_error } = recordData;

  if (!related_item && !related_analytics && !related_error) {
    return (
      <div className="text-center py-12 text-gray-500">
        <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
        <p className="text-lg font-medium">No Related Records</p>
        <p className="text-sm mt-2">This record has no relationships to other records</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Related Physical Item */}
      {related_item && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h3 className="font-bold text-lg mb-3 text-green-900 flex items-center gap-2">
            <span>📦</span> Physical Item (Accessioned)
          </h3>
          <div className="bg-white rounded p-3 space-y-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-sm text-gray-600">Barcode</span>
                <div className="font-mono font-bold">{related_item.barcode}</div>
              </div>
              <div>
                <span className="text-sm text-gray-600">Call Number</span>
                <div className="font-mono font-bold">{related_item.alternative_call_number}</div>
              </div>
              {related_item.title && (
                <div className="col-span-2">
                  <span className="text-sm text-gray-600">Title</span>
                  <div className="font-semibold">{related_item.title}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Related Analytics */}
      {related_analytics && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-bold text-lg mb-3 text-blue-900 flex items-center gap-2">
            <span>📊</span> Analytics Record
          </h3>
          <div className="bg-white rounded p-3 space-y-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-sm text-gray-600">Barcode</span>
                <div className="font-mono font-bold">{related_analytics.barcode}</div>
              </div>
              <div>
                <span className="text-sm text-gray-600">Call Number</span>
                <div className="font-mono font-bold">{related_analytics.alternative_call_number}</div>
              </div>
              {related_analytics.title && (
                <div className="col-span-2">
                  <span className="text-sm text-gray-600">Title</span>
                  <div className="font-semibold">{related_analytics.title}</div>
                </div>
              )}
              {related_analytics.status && (
                <div>
                  <span className="text-sm text-gray-600">Status</span>
                  <div className="font-semibold">{related_analytics.status}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Related Error */}
      {related_error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="font-bold text-lg mb-3 text-red-900 flex items-center gap-2">
            <span>⚠️</span> Analytics Error
          </h3>
          <div className="bg-white rounded p-3 space-y-2">
            <div>
              <span className="text-sm text-gray-600">Error Reason</span>
              <div className="font-bold text-red-700">{related_error.error_reason}</div>
            </div>
            {related_error.title && (
              <div>
                <span className="text-sm text-gray-600">Title</span>
                <div className="text-gray-900">{related_error.title}</div>
              </div>
            )}
            {related_error.call_number && (
              <div>
                <span className="text-sm text-gray-600">Call Number</span>
                <div className="font-mono text-gray-900">{related_error.call_number}</div>
              </div>
            )}
            <div className="text-sm text-gray-500 italic mt-2">
              This analytics record has been flagged as inaccurate and is excluded from space calculations.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shelf Context Tab - Show what's on the same shelf
// ─────────────────────────────────────────────────────────────────────────────
function ShelfContextTab({ recordData, recordType }) {
  const { shelf_context } = recordData;

  if (!shelf_context) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p>No shelf context available</p>
      </div>
    );
  }

  const { shelf_call_number, position, floor, range, ladder, shelf, analytics_neighbors, physical_items } = shelf_context;

  return (
    <div className="space-y-6">
      {/* Shelf Location */}
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
        <h3 className="font-bold text-lg mb-3 text-purple-900">Shelf Location</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <span className="text-sm text-gray-600">Floor</span>
            <div className="font-bold text-lg">{floor}</div>
          </div>
          <div>
            <span className="text-sm text-gray-600">Range</span>
            <div className="font-bold text-lg">{range}</div>
          </div>
          <div>
            <span className="text-sm text-gray-600">Ladder</span>
            <div className="font-bold text-lg">{ladder}</div>
          </div>
          <div>
            <span className="text-sm text-gray-600">Shelf</span>
            <div className="font-bold text-lg">{shelf}</div>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t">
          <span className="text-sm text-gray-600">Full Call Number</span>
          <div className="font-mono font-bold text-lg text-purple-900">{shelf_call_number}</div>
          {position && (
            <div className="text-sm text-gray-600 mt-1">Position: {position}</div>
          )}
        </div>
      </div>

      {/* Physical Items on Shelf */}
      {physical_items && physical_items.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg">
          <div className="bg-gray-50 px-4 py-3 border-b">
            <h3 className="font-bold text-gray-900">📦 Physical Items on This Shelf ({physical_items.length})</h3>
          </div>
          <div className="p-4">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Position</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Barcode</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {physical_items.map((item, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono text-sm">{item.position || '-'}</td>
                    <td className="px-3 py-2 font-mono text-sm">{item.barcode}</td>
                    <td className="px-3 py-2 text-sm">{item.title || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Analytics Neighbors */}
      {analytics_neighbors && analytics_neighbors.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg">
          <div className="bg-gray-50 px-4 py-3 border-b">
            <h3 className="font-bold text-gray-900">📊 Analytics Records on This Shelf ({analytics_neighbors.length})</h3>
            <p className="text-sm text-gray-500 mt-1">Estimated records (not yet accessioned)</p>
          </div>
          <div className="p-4">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Call Number</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Barcode</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Accessioned</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {analytics_neighbors.slice(0, 20).map((item, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono text-sm">{item.call_number || '-'}</td>
                    <td className="px-3 py-2 font-mono text-sm">{item.barcode}</td>
                    <td className="px-3 py-2 text-center">
                      {item.has_item_link ? (
                        <span className="text-green-600" title="Item has been accessioned">
                          <svg className="w-5 h-5 inline-block" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                        </span>
                      ) : (
                        <span className="text-gray-400" title="Not yet accessioned">
                          <svg className="w-5 h-5 inline-block" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                          </svg>
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        item.has_item_link ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-sm">{item.title || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {analytics_neighbors.length > 20 && (
              <div className="text-sm text-gray-500 text-center mt-3">
                Showing first 20 of {analytics_neighbors.length} records
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
