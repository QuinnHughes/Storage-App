import React, { useState, useEffect } from 'react';
import { Pencil, Trash2, Plus, X, Check, AlertCircle } from 'lucide-react';

const tableConfigs = {
  items: {
    displayName: 'Items',
    fields: [
      { name: 'id', label: 'ID', type: 'text', readonly: true },
      { name: 'barcode', label: 'Barcode', type: 'text', required: true },
      { name: 'alternative_call_number', label: 'Alt Call Number', type: 'text', required: true },
      { name: 'location', label: 'Location', type: 'select', distinct: true },
      { name: 'floor', label: 'Floor', type: 'select', distinct: true },
      { name: 'range_code', label: 'Range Code', type: 'select', distinct: true },
      { name: 'ladder', label: 'Ladder', type: 'select', distinct: true },
      { name: 'shelf', label: 'Shelf', type: 'select', distinct: true },
      { name: 'position', label: 'Position', type: 'select', distinct: true },
    ],
  },
  analytics: {
    displayName: 'Analytics',
    fields: [
      { name: 'id', label: 'ID', type: 'text', readonly: true },
      { name: 'barcode', label: 'Barcode', type: 'text', required: true },
      { name: 'alternative_call_number', label: 'Alt Call Number', type: 'text' },
      { name: 'title', label: 'Title', type: 'text' },
      { name: 'call_number', label: 'Call Number', type: 'text' },
      { name: 'location_code', label: 'Location Code', type: 'select', distinct: true },
      { name: 'item_policy', label: 'Item Policy', type: 'select', distinct: true },
      { name: 'description', label: 'Description', type: 'text' },
      { name: 'status', label: 'Status', type: 'select', distinct: true },
    ],
  },
  weeded_items: {
    displayName: 'Weeded Items',
    fields: [
      { name: 'id', label: 'ID', type: 'text', readonly: true },
      { name: 'alternative_call_number', label: 'Alt Call Number', type: 'text', required: true },
      { name: 'barcode', label: 'Barcode', type: 'text', required: true },
      { name: 'scanned_barcode', label: 'Scanned Barcode', type: 'text' },
      { name: 'is_weeded', label: 'Is Weeded', type: 'checkbox' },
    ],
  },
  analytics_errors: {
    displayName: 'Analytics Errors',
    fields: [
      { name: 'id', label: 'ID', type: 'text', readonly: true },
      { name: 'barcode', label: 'Barcode', type: 'text', required: true },
      { name: 'alternative_call_number', label: 'Alt Call Number', type: 'text' },
      { name: 'title', label: 'Title', type: 'text' },
      { name: 'call_number', label: 'Call Number', type: 'text' },
      { name: 'status', label: 'Status', type: 'select', distinct: true },
      { name: 'error_reason', label: 'Error Reason', type: 'select', distinct: true, required: true },
    ],
  },
};

export default function ManageRecords() {
  const [table, setTable] = useState('items');
  const [fields, setFields] = useState(tableConfigs.items.fields);
  const [searchParams, setSearchParams] = useState({});
  const [options, setOptions] = useState({});
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('create'); // 'create', 'edit'
  const [currentRecord, setCurrentRecord] = useState({});
  const [modalLoading, setModalLoading] = useState(false);

  const token = localStorage.getItem('token');

  useEffect(() => {
    const cfg = tableConfigs[table];
    setFields(cfg.fields);
    
    // Reset search params for new table
    const initParams = {};
    cfg.fields.forEach(f => initParams[f.name] = f.type === 'checkbox' ? false : '');
    setSearchParams(initParams);
    setResults([]);
    setError('');
    setSuccess('');

    // Load distinct values for select fields
    const loadDistinct = async () => {
      const newOpts = {};
      await Promise.all(cfg.fields.map(async f => {
        if (f.distinct) {
          try {
            const res = await fetch(
              `/record-management/${table}/distinct/${f.name}`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            newOpts[f.name] = res.ok ? await res.json() : [];
          } catch {
            newOpts[f.name] = [];
          }
        }
      }));
      setOptions(newOpts);
    };
    loadDistinct();
  }, [table, token]);

  const handleSearchChange = (name, type) => e => {
    const val = type === 'checkbox' ? e.target.checked : e.target.value;
    setSearchParams(p => ({ ...p, [name]: val }));
  };

  const handleModalChange = (name, type) => e => {
    const val = type === 'checkbox' ? e.target.checked : e.target.value;
    setCurrentRecord(p => ({ ...p, [name]: val }));
  };

  const doSearch = async e => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    
    const qs = new URLSearchParams();
    Object.entries(searchParams).forEach(([k, v]) => {
      if (v !== '' && v !== false) qs.append(k, v);
    });
    
    try {
      const res = await fetch(
        `/record-management/${table}/search?${qs.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error('Failed to fetch records');
      const data = await res.json();
      setResults(data);
    } catch {
      setError('Error loading records');
    }
    setLoading(false);
  };

  const openCreateModal = () => {
    const initialRecord = {};
    fields.forEach(f => {
      if (!f.readonly) {
        initialRecord[f.name] = f.type === 'checkbox' ? false : '';
      }
    });
    setCurrentRecord(initialRecord);
    setModalMode('create');
    setShowModal(true);
  };

  const openEditModal = (record) => {
    setCurrentRecord({ ...record });
    setModalMode('edit');
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setCurrentRecord({});
    setError('');
    setSuccess('');
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setModalLoading(true);
    setError('');
    setSuccess('');

    try {
      const url = modalMode === 'create' 
        ? `/record-management/${table}/create`
        : `/record-management/${table}/${currentRecord.id}`;
      
      const method = modalMode === 'create' ? 'POST' : 'PATCH';
      
      // Filter out readonly fields for create
      const payload = { ...currentRecord };
      if (modalMode === 'create') {
        fields.forEach(f => {
          if (f.readonly) delete payload[f.name];
        });
      }

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.text();
        throw new Error(errorData || 'Operation failed');
      }

      setSuccess(`Record ${modalMode === 'create' ? 'created' : 'updated'} successfully`);
      closeModal();
      
      // Refresh results if we have some
      if (results.length > 0) {
        doSearch({ preventDefault: () => {} });
      }
    } catch (err) {
      setError(err.message || `Failed to ${modalMode} record`);
    }
    setModalLoading(false);
  };

  const handleDelete = async (recordId) => {
    if (!window.confirm('Are you sure you want to delete this record?')) return;

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch(`/record-management/${table}/${recordId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error('Failed to delete record');

      setSuccess('Record deleted successfully');
      
      // Refresh results
      if (results.length > 0) {
        doSearch({ preventDefault: () => {} });
      }
    } catch {
      setError('Failed to delete record');
    }
    setLoading(false);
  };

  const renderField = (field, value, onChange, disabled = false) => {
    if (field.type === 'checkbox') {
      return (
        <input
          type="checkbox"
          checked={value || false}
          onChange={onChange}
          disabled={disabled}
          className="form-checkbox h-5 w-5 text-blue-600"
        />
      );
    }

    if (field.type === 'select') {
      return (
        <select
          value={value || ''}
          onChange={onChange}
          disabled={disabled}
          className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
        >
          <option value="">Select...</option>
          {(options[field.name] || []).map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );
    }

    return (
      <input
        type="text"
        value={value || ''}
        onChange={onChange}
        disabled={disabled}
        placeholder={field.readonly ? 'Auto-generated' : `Enter ${field.label}`}
        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
      />
    );
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold text-blue-700">
          Manage {tableConfigs[table].displayName}
        </h1>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add New Record
        </button>
      </div>

      {/* Success/Error Messages */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 flex items-center">
          <AlertCircle className="w-5 h-5 mr-2" />
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4 flex items-center">
          <Check className="w-5 h-5 mr-2" />
          {success}
        </div>
      )}

      {/* Search Form */}
      <form onSubmit={doSearch} className="bg-white shadow-md rounded px-6 py-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-700 mb-4">Search Filters</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Table</label>
            <select
              value={table}
              onChange={e => setTable(e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {Object.entries(tableConfigs).map(([key, config]) => (
                <option key={key} value={key}>{config.displayName}</option>
              ))}
            </select>
          </div>
          {fields.slice(0, 8).map(f => ( // Limit displayed search fields
            <div key={f.name}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
              {f.type === 'checkbox' ? (
                <input
                  type="checkbox"
                  checked={searchParams[f.name] || false}
                  onChange={handleSearchChange(f.name, 'checkbox')}
                  className="form-checkbox h-5 w-5 text-blue-600 mt-2"
                />
              ) : f.type === 'select' ? (
                <select
                  value={searchParams[f.name] || ''}
                  onChange={handleSearchChange(f.name, 'text')}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All</option>
                  {(options[f.name] || []).map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={searchParams[f.name] || ''}
                  onChange={handleSearchChange(f.name, 'text')}
                  placeholder={`Search ${f.label}`}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              )}
            </div>
          ))}
        </div>
        <div className="mt-6 text-right">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex justify-center py-2 px-6 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>
      </form>

      {/* Results Table */}
      <div className="bg-white shadow-md rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                {fields.map(f => (
                  <th key={f.name} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {f.label}
                  </th>
                ))}
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {results.length === 0 ? (
                <tr>
                  <td colSpan={fields.length + 1} className="px-6 py-4 text-center text-gray-500">
                    {loading ? 'Loading...' : 'No records found. Try adjusting your search criteria.'}
                  </td>
                </tr>
              ) : (
                results.map((row, idx) => (
                  <tr key={row.id || idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    {fields.map(f => (
                      <td key={f.name} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {f.type === 'checkbox' 
                          ? (row[f.name] ? 'Yes' : 'No')
                          : (row[f.name] || '--')
                        }
                      </td>
                    ))}
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => openEditModal(row)}
                        className="text-blue-600 hover:text-blue-900 mr-3"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(row.id)}
                        className="text-red-600 hover:text-red-900"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal for Create/Edit */}
      {showModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-1/2 shadow-lg rounded-md bg-white">
            <div className="flex justify-between items-center pb-3">
              <h3 className="text-lg font-semibold">
                {modalMode === 'create' ? 'Create New' : 'Edit'} {tableConfigs[table].displayName.slice(0, -1)}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-96 overflow-y-auto">
                {fields.map(f => (
                  <div key={f.name} className={f.name === 'id' ? 'md:col-span-2' : ''}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {f.label}
                      {f.required && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    {renderField(
                      f,
                      currentRecord[f.name],
                      handleModalChange(f.name, f.type),
                      f.readonly
                    )}
                  </div>
                ))}
              </div>
              
              <div className="flex justify-end space-x-3 pt-4 mt-4 border-t">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalLoading}
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                >
                  {modalLoading ? 'Saving...' : modalMode === 'create' ? 'Create' : 'Update'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}