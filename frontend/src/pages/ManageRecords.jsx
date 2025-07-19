import React, { useState, useEffect } from 'react';

export default function ManageRecords() {
  const [table, setTable] = useState('items');
  const [searchParams, setSearchParams] = useState({});
  const [options, setOptions] = useState({});
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({});

  const fieldsByTable = {
    items: [
      { name: 'id', label: 'ID', type: 'text' },
      { name: 'barcode', label: 'Barcode', type: 'text' },
      { name: 'alternative_call_number', label: 'Alt Call #', type: 'text' },
      { name: 'location', label: 'Location', type: 'text' },
      { name: 'floor', label: 'Floor', type: 'text' },
      { name: 'range_code', label: 'Range Code', type: 'text' },
    ],
    analytics: [
      { name: 'id', label: 'ID', type: 'text' },
      { name: 'barcode', label: 'Barcode', type: 'text' },
      { name: 'alternative_call_number', label: 'Alt Call #', type: 'text' },
      { name: 'title', label: 'Title', type: 'text' },
      { name: 'call_number', label: 'Call Number', type: 'text' },
      { name: 'item_policy', label: 'Policy', type: 'text' },
      { name: 'location_code', label: 'Location Code', type: 'text' },
      { name: 'status', label: 'Status', type: 'text' },
    ],
    weeded_items: [
      { name: 'id', label: 'ID', type: 'text' },
      { name: 'barcode', label: 'Barcode', type: 'text' },
      { name: 'alternative_call_number', label: 'Alt Call #', type: 'text' },
      { name: 'scanned_barcode', label: 'Scanned Barcode', type: 'text' },
      { name: 'is_weeded', label: 'Is Weeded', type: 'checkbox' },
    ],
    analytics_errors: [
      { name: 'id', label: 'ID', type: 'text' },
      { name: 'barcode', label: 'Barcode', type: 'text' },
      { name: 'alternative_call_number', label: 'Alt Call #', type: 'text' },
      { name: 'title', label: 'Title', type: 'text' },
      { name: 'call_number', label: 'Call Number', type: 'text' },
      { name: 'status', label: 'Status', type: 'text' },
      { name: 'error_reason', label: 'Error Reason', type: 'text' },
    ],
  };

  // Reset search params and load distinct dropdown options on table change
  useEffect(() => {
    const defaults = {};
    fieldsByTable[table].forEach(field => {
      defaults[field.name] = field.type === 'checkbox' ? false : '';
    });
    setSearchParams(defaults);
    setResults([]);
    setError('');
    setEditingId(null);
    setFormData({});

    // Fetch distinct values for dropdowns
    const fetchOptions = async () => {
      const token = localStorage.getItem('token');
      const newOpts = {};
      for (let field of fieldsByTable[table]) {
        if (field.name === 'id' || field.type === 'text') {
          try {
            const resp = await fetch(
              `/record-management/${table}/distinct/${field.name}`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            if (resp.ok) newOpts[field.name] = await resp.json();
          } catch (e) {
            console.error(`Failed to load options for ${field.name}`, e);
          }
        }
      }
      setOptions(newOpts);
    };
    fetchOptions();
  }, [table]);

  // Handle search parameter changes
  const handleParamChange = name => e => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setSearchParams(prev => ({ ...prev, [name]: val }));
  };

  // Perform search
  const handleSearch = async () => {
    setLoading(true);
    setError('');
    setResults([]);
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      if (searchParams.id) {
        params.append('id', searchParams.id);
      } else {
        fieldsByTable[table].forEach(field => {
          if (field.name === 'id') return;
          const val = searchParams[field.name];
          if (field.type === 'checkbox') {
            params.append(field.name, val);
          } else if (val.trim()) {
            params.append(field.name, val);
          }
        });
      }
      const qs = params.toString();
      const url = `/record-management/${table}/search${qs ? `?${qs}` : ''}`;
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!resp.ok) {
        const body = await resp.json();
        throw new Error(body.detail || `Error ${resp.status}`);
      }
      const data = await resp.json();
      setResults(Array.isArray(data) ? data : [data]);
    } catch (e) {
      console.error(e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Inline edit handlers (unchanged)
  const startEdit = record => { setEditingId(record.id); setFormData(record); setError(''); };
  const cancelEdit = () => { setEditingId(null); setFormData({}); };
  const saveEdit = async () => {
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(
        `/record-management/${table}/${editingId}`,
        { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(formData) }
      );
      if (!resp.ok) {
        const body = await resp.json(); throw new Error(body.detail || `Error ${resp.status}`);
      }
      const updated = await resp.json();
      setResults(prev => prev.map(item => item.id === editingId ? updated : item));
      setEditingId(null);
    } catch (e) { console.error(e); setError(e.message); }
  };
  const handleDelete = async id => {
    if (!window.confirm('Delete this record?')) return;
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`/record-management/${table}/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (!resp.ok) throw new Error(`Error ${resp.status}`);
      setResults(prev => prev.filter(item => item.id !== id));
    } catch (e) { console.error(e); setError(e.message); }
  };

  const columns = results.length ? Object.keys(results[0]) : [];

  return (
    <div className="p-6 max-w-full mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Manage Records</h1>

      {/* Search Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
        <div>
          <label className="block mb-1">Table</label>
          <select value={table} onChange={e => setTable(e.target.value)} className="border p-2 rounded w-full">
            {Object.keys(fieldsByTable).map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
          </select>
        </div>

        {/* Dynamic dropdowns or inputs based on available options */}
        {fieldsByTable[table].map(field => (
          <div key={field.name}>
            <label className="block mb-1">{field.label}</label>
            {options[field.name] && options[field.name].length > 0 ? (
              <select value={searchParams[field.name] || ''} onChange={handleParamChange(field.name)} className="border p-2 rounded w-full">
                <option value="">Any</option>
                {options[field.name].map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            ) : field.type === 'checkbox' ? (
              <input
                type="checkbox"
                checked={!!searchParams[field.name]}
                onChange={handleParamChange(field.name)}
                className="rounded"
              />
            ) : (
              <input
                type="text"
                value={searchParams[field.name] || ''}
                onChange={handleParamChange(field.name)}
                className="border p-2 rounded w-full"
              />
            )}
          </div>
        ))}

        <div className="flex items-end">
          <button onClick={handleSearch} disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded w-full">
            {loading ? 'Searching…' : 'Search'}
          </button>
        </div>
      </div>

      {error && <div className="text-red-600 mb-4">{error}</div>}

      {/* Results Table */}
      {results.length ? (
        <table className="w-full table-auto border-collapse mb-6">
          <thead><tr className="bg-gray-100">
            {columns.map(col => <th key={col} className="border px-2 py-1 text-left">{col}</th>)}
            <th className="border px-2 py-1">Actions</th>
          </tr></thead>
          <tbody>
            {results.map(rec => (
              <tr key={rec.id} className="even:bg-gray-50">
                {columns.map(col => <td key={col} className="border px-2 py-1">
                  {editingId === rec.id ? (
                    <input
                      type="text"
                      value={formData[col] ?? ''}
                      onChange={e => setFormData(prev => ({ ...prev, [col]: e.target.value }))}
                      className="w-full border rounded px-1 py-0.5"
                    />
                  ) : String(rec[col] ?? '')}
                </td>)}
                <td className="border px-2 py-1 space-x-1">
                  {editingId === rec.id ? (
                    <>
                      <button onClick={saveEdit} className="px-2 py-1 bg-green-600 text-white rounded text-sm">Save</button>
                      <button onClick={cancelEdit} className="px-2 py-1 bg-gray-300 rounded text-sm">Cancel</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => startEdit(rec)} className="px-2 py-1 bg-indigo-600 text-white rounded text-sm">Edit</button>
                      <button onClick={() => handleDelete(rec.id)} className="px-2 py-1 bg-red-600 text-white rounded text-sm">Delete</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : !loading && <div className="text-gray-500">No results to display.</div>}
    </div>
  );
}
