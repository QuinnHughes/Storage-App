import React, { useState, useEffect } from 'react';

const tableConfigs = {
  items: {
    fields: [
      { name: 'id', label: 'ID', type: 'text' },
      { name: 'barcode', label: 'Barcode', type: 'text' },
      { name: 'alternative_call_number', label: 'Alt Call#', type: 'text' },
      { name: 'location', label: 'Location', type: 'select', distinct: true },
      { name: 'floor', label: 'Floor', type: 'select', distinct: true },
      { name: 'range_code', label: 'Range', type: 'select', distinct: true },
      { name: 'ladder', label: 'Ladder', type: 'select', distinct: true },
      { name: 'shelf', label: 'Shelf', type: 'select', distinct: true },
      { name: 'position', label: 'Position', type: 'select', distinct: true },
    ],
  },
  analytics: {
    fields: [
      { name: 'id', label: 'ID', type: 'text' },
      { name: 'barcode', label: 'Barcode', type: 'text' },
      { name: 'alternative_call_number', label: 'Alt Call#', type: 'text' },
      { name: 'title', label: 'Title', type: 'text' },
      { name: 'call_number', label: 'Call No', type: 'text' },
      { name: 'location_code', label: 'Location Code', type: 'select', distinct: true },
      { name: 'item_policy', label: 'Policy', type: 'select', distinct: true },
      { name: 'status', label: 'Status', type: 'select', distinct: true },
    ],
  },
  weeded_items: {
    fields: [
      { name: 'id', label: 'ID', type: 'text' },
      { name: 'barcode', label: 'Barcode', type: 'text' },
      { name: 'alternative_call_number', label: 'Alt Call#', type: 'text' },
      { name: 'scanned_barcode', label: 'Scanned Barcode', type: 'text' },
      { name: 'is_weeded', label: 'Is Weeded', type: 'checkbox' },
    ],
  },
  analytics_errors: {
    fields: [
      { name: 'id', label: 'ID', type: 'text' },
      { name: 'barcode', label: 'Barcode', type: 'text' },
      { name: 'alternative_call_number', label: 'Alt Call#', type: 'text' },
      { name: 'title', label: 'Title', type: 'text' },
      { name: 'call_number', label: 'Call No', type: 'text' },
      { name: 'status', label: 'Status', type: 'select', distinct: true },
      { name: 'error_reason', label: 'Error Reason', type: 'select', distinct: true },
    ],
  },
};

export default function ManageRecords() {
  const [table, setTable] = useState('items');
  const [fields, setFields] = useState(tableConfigs.items.fields);
  const [params, setParams] = useState({});
  const [options, setOptions] = useState({});
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const cfg = tableConfigs[table];
    setFields(cfg.fields);
    const initParams = {};
    cfg.fields.forEach(f => initParams[f.name] = f.type === 'checkbox' ? false : '');
    setParams(initParams);
    setResults([]);
    setError('');

    const loadDistinct = async () => {
      const token = localStorage.getItem('token');
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
  }, [table]);

  const handleChange = (name, type) => e => {
    const val = type === 'checkbox' ? e.target.checked : e.target.value;
    setParams(p => ({ ...p, [name]: val }));
  };

  const doSearch = async e => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== '' && v !== false) qs.append(k, v);
    });
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(
        `/record-management/${table}/search?${qs.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error();
      const data = await res.json();
      setResults(data);
    } catch {
      setError('Error loading records');
    }
    setLoading(false);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-4xl font-bold text-center text-blue-700 mb-8">Manage Records</h1>
      <form onSubmit={doSearch} className="bg-white shadow-md rounded px-6 py-6 mb-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Table</label>
            <select
              value={table}
              onChange={e => setTable(e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {Object.keys(tableConfigs).map(t => (
                <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>
          {fields.map(f => (
            <div key={f.name}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
              {f.type === 'checkbox' ? (
                <input
                  type="checkbox"
                  checked={params[f.name]}
                  onChange={handleChange(f.name, 'checkbox')}
                  className="form-checkbox h-5 w-5 text-blue-600"
                />
              ) : f.type === 'select' ? (
                <select
                  value={params[f.name]}
                  onChange={handleChange(f.name, 'text')}
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
                  value={params[f.name]}
                  onChange={handleChange(f.name, 'text')}
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
            className="inline-flex justify-center py-2 px-6 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>
      </form>

      {error && <div className="text-red-600 text-center mb-4">{error}</div>}

      <div className="overflow-x-auto">
        <table className="min-w-full bg-white shadow-md rounded-lg overflow-hidden">
          <thead className="bg-blue-100">
            <tr>
              {fields.map(f => (
                <th key={f.name} className="px-4 py-2 text-left text-sm font-semibold text-blue-700">
                  {f.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {results.map((row, idx) => (
              <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                {fields.map(f => (
                  <td key={f.name} className="px-4 py-2 text-sm text-gray-800">
                    {String(row[f.name] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
