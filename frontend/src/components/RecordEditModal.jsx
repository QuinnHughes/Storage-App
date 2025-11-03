import React, { useState, useEffect } from 'react';
import apiFetch from '../api/client';

/**
 * RecordEditModal - Modal for editing Analytics and Item records
 * 
 * Features:
 * - Dynamic form based on record type
 * - Field validation
 * - Change preview (show before/after)
 * - Role-based field restrictions
 * - Success/error handling
 */
export default function RecordEditModal({ 
  isOpen, 
  onClose, 
  recordType, // 'analytics' or 'item'
  recordData, 
  onSave, // Callback after successful save
  userRole 
}) {
  const [formData, setFormData] = useState({});
  const [originalData, setOriginalData] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [showPreview, setShowPreview] = useState(false);

  // Initialize form data when modal opens
  useEffect(() => {
    if (isOpen && recordData) {
      const initial = recordType === 'analytics' 
        ? {
            barcode: recordData.barcode || '',
            title: recordData.title || '',
            alternative_call_number: recordData.alternative_call_number || '',
            location_code: recordData.location_code || '',
            item_policy: recordData.item_policy || '',
            call_number: recordData.call_number || '',
            description: recordData.description || '',
            status: recordData.status || '',
            has_item_link: Boolean(recordData.has_item_link)
          }
        : {
            barcode: recordData.barcode || '',
            alternative_call_number: recordData.alternative_call_number || '',
            location: recordData.location || '',
            floor: String(recordData.floor || ''),
            range_code: recordData.range_code || '',
            ladder: String(recordData.ladder || ''),
            shelf: String(recordData.shelf || ''),
            position: String(recordData.position || '')
          };
      
      setFormData(initial);
      setOriginalData(initial);
      setError(null);
      setShowPreview(false);
    }
  }, [isOpen, recordData, recordType]);

  // Handle input changes
  const handleChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Get changed fields for preview
  const getChanges = () => {
    const changes = {};
    Object.keys(formData).forEach(key => {
      if (formData[key] !== originalData[key]) {
        changes[key] = {
          old: originalData[key],
          new: formData[key]
        };
      }
    });
    return changes;
  };

  // Validate form
  const validateForm = () => {
    const errors = [];
    
    if (recordType === 'analytics') {
      if (!formData.barcode?.trim()) errors.push('Barcode is required');
      if (!formData.title?.trim()) errors.push('Title is required');
      if (!formData.alternative_call_number?.trim()) errors.push('Alternative call number is required');
    } else {
      if (!formData.barcode?.trim()) errors.push('Barcode is required');
      if (!formData.alternative_call_number?.trim()) errors.push('Alternative call number is required');
      
      // Validate call number format for items
      const callNumRegex = /^S-[^-]+-[^-]+-\d+-\d+-\d+$/;
      if (formData.alternative_call_number && !callNumRegex.test(formData.alternative_call_number)) {
        errors.push('Alternative call number must be in format: S-{floor}-{range}-{ladder}-{shelf}-{position}');
      }
    }
    
    return errors;
  };

  // Handle save
  const handleSave = async () => {
    const changes = getChanges();
    
    if (Object.keys(changes).length === 0) {
      setError('No changes detected');
      return;
    }

    const validationErrors = validateForm();
    if (validationErrors.length > 0) {
      setError(validationErrors.join('; '));
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const updates = {};
      Object.keys(changes).forEach(key => {
        updates[key] = formData[key];
      });

      const response = await apiFetch(`/records/${recordType}/${recordData.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to update record');
      }

      const data = await response.json();
      
      if (data.success) {
        // Call the onSave callback with updated data
        if (onSave) {
          onSave({ ...recordData, ...updates });
        }
        onClose();
      } else {
        setError(data.message || 'Failed to update record');
      }
    } catch (err) {
      console.error('Save error:', err);
      setError(err.message || 'An error occurred while saving');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  const changes = getChanges();
  const hasChanges = Object.keys(changes).length > 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-blue-600 text-white px-6 py-4 flex justify-between items-center">
          <h2 className="text-xl font-bold">
            ✏️ Edit {recordType === 'analytics' ? 'Analytics' : 'Item'} Record
          </h2>
          <button 
            onClick={onClose}
            className="text-white hover:text-gray-200 text-2xl font-bold"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          {/* Toggle Preview */}
          {hasChanges && (
            <div className="mb-4 flex justify-end">
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                {showPreview ? '📝 Edit Form' : '👁️ Preview Changes'}
              </button>
            </div>
          )}

          {showPreview ? (
            <ChangePreview changes={changes} />
          ) : (
            <div>
              {recordType === 'analytics' ? (
                <AnalyticsEditForm 
                  formData={formData} 
                  onChange={handleChange}
                  userRole={userRole}
                />
              ) : (
                <ItemEditForm 
                  formData={formData} 
                  onChange={handleChange}
                  userRole={userRole}
                />
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 flex justify-between items-center border-t">
          <div className="text-sm text-gray-600">
            {hasChanges ? (
              <span className="text-blue-600 font-medium">
                {Object.keys(changes).length} field{Object.keys(changes).length !== 1 ? 's' : ''} changed
              </span>
            ) : (
              <span>No changes yet</span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!hasChanges || isSaving}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Analytics Edit Form
// ─────────────────────────────────────────────────────────────────────────────
function AnalyticsEditForm({ formData, onChange, userRole }) {
  const isBookWormOrHigher = ['book_worm', 'cataloger', 'admin'].includes(userRole);

  if (!isBookWormOrHigher) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p className="text-lg">You don't have permission to edit analytics records.</p>
        <p className="text-sm mt-2">Requires book_worm role or higher.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Barcode */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Barcode *
          </label>
          <input
            type="text"
            value={formData.barcode || ''}
            onChange={(e) => onChange('barcode', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Enter barcode"
          />
        </div>

        {/* Alternative Call Number */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Alternative Call Number *
          </label>
          <input
            type="text"
            value={formData.alternative_call_number || ''}
            onChange={(e) => onChange('alternative_call_number', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
            placeholder="S-3-01B-02-03-001"
          />
        </div>

        {/* Title */}
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Title *
          </label>
          <input
            type="text"
            value={formData.title || ''}
            onChange={(e) => onChange('title', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Enter title"
          />
        </div>

        {/* Call Number */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Call Number
          </label>
          <input
            type="text"
            value={formData.call_number || ''}
            onChange={(e) => onChange('call_number', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
            placeholder="Y 4.B 22/1:"
          />
        </div>

        {/* Location Code */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Location Code
          </label>
          <input
            type="text"
            value={formData.location_code || ''}
            onChange={(e) => onChange('location_code', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="01B"
          />
        </div>

        {/* Item Policy */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Item Policy
          </label>
          <input
            type="text"
            value={formData.item_policy || ''}
            onChange={(e) => onChange('item_policy', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Government Documents"
          />
        </div>

        {/* Status */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Status
          </label>
          <select
            value={formData.status || ''}
            onChange={(e) => onChange('status', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Select status</option>
            <option value="Available">Available</option>
            <option value="Checked Out">Checked Out</option>
            <option value="Missing">Missing</option>
            <option value="In Transit">In Transit</option>
            <option value="On Hold">On Hold</option>
          </select>
        </div>

        {/* Description */}
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Description
          </label>
          <textarea
            value={formData.description || ''}
            onChange={(e) => onChange('description', e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Enter description"
          />
        </div>

        {/* Has Item Link */}
        <div className="md:col-span-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.has_item_link || false}
              onChange={(e) => onChange('has_item_link', e.target.checked)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span className="text-sm font-medium text-gray-700">
              Has Item Link (Accessioned)
            </span>
          </label>
          <p className="text-xs text-gray-500 mt-1 ml-6">
            Check this box if a physical item exists for this analytics record
          </p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Item Edit Form
// ─────────────────────────────────────────────────────────────────────────────
function ItemEditForm({ formData, onChange, userRole }) {
  const isCatalogerOrHigher = ['cataloger', 'admin'].includes(userRole);

  if (!isCatalogerOrHigher) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p className="text-lg">You don't have permission to edit item records.</p>
        <p className="text-sm mt-2">Requires cataloger role or higher.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Barcode */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Barcode *
          </label>
          <input
            type="text"
            value={formData.barcode || ''}
            onChange={(e) => onChange('barcode', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Enter barcode"
          />
        </div>

        {/* Alternative Call Number */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Alternative Call Number *
          </label>
          <input
            type="text"
            value={formData.alternative_call_number || ''}
            onChange={(e) => onChange('alternative_call_number', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
            placeholder="S-3-01B-02-03-001"
          />
          <p className="text-xs text-gray-500 mt-1">
            Format: S-floor-range-ladder-shelf-position
          </p>
        </div>

        {/* Location */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Location
          </label>
          <input
            type="text"
            value={formData.location || ''}
            onChange={(e) => onChange('location', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="01B"
          />
        </div>

        {/* Floor */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Floor
          </label>
          <input
            type="text"
            value={formData.floor || ''}
            onChange={(e) => onChange('floor', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="3"
          />
        </div>

        {/* Range Code */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Range Code
          </label>
          <input
            type="text"
            value={formData.range_code || ''}
            onChange={(e) => onChange('range_code', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="01B"
          />
        </div>

        {/* Ladder */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Ladder
          </label>
          <input
            type="text"
            value={formData.ladder || ''}
            onChange={(e) => onChange('ladder', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="02"
          />
        </div>

        {/* Shelf */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Shelf
          </label>
          <input
            type="text"
            value={formData.shelf || ''}
            onChange={(e) => onChange('shelf', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="03"
          />
        </div>

        {/* Position */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Position
          </label>
          <input
            type="text"
            value={formData.position || ''}
            onChange={(e) => onChange('position', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="001"
          />
        </div>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
        <p className="text-sm text-yellow-800">
          <strong>⚠️ Important:</strong> The Alternative Call Number should match the format and reflect the individual field values.
          Changes to location fields may require updating the call number accordingly.
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Change Preview Component
// ─────────────────────────────────────────────────────────────────────────────
function ChangePreview({ changes }) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
      <h3 className="font-bold text-lg mb-4">📋 Change Summary</h3>
      <div className="space-y-3">
        {Object.entries(changes).map(([field, { old, new: newValue }]) => (
          <div key={field} className="bg-white rounded border border-gray-200 p-3">
            <div className="font-medium text-sm text-gray-700 mb-2">
              {field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-gray-500 mb-1">Old Value</div>
                <div className="bg-red-50 border border-red-200 rounded px-2 py-1 text-sm">
                  {old === '' || old === null ? <em className="text-gray-400">(empty)</em> : String(old)}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">New Value</div>
                <div className="bg-green-50 border border-green-200 rounded px-2 py-1 text-sm">
                  {newValue === '' || newValue === null ? <em className="text-gray-400">(empty)</em> : String(newValue)}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
