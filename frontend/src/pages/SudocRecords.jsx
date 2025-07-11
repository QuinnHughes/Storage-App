// src/pages/SudocRecords.jsx
import React, { useState } from 'react';
import axios from 'axios';

export default function SudocRecords() {
  const [query, setQuery] = useState('');
  const [titleQuery, setTitleQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [fields, setFields] = useState([]);

  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');

  const [loadLoading, setLoadLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState('');
  const [exportSuccess, setExportSuccess] = useState('');

  // Perform a search with authorization header
  const handleSearch = async () => {
    setSearchError('');
    setSearchLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const resp = await axios.get('/catalog/sudoc/search/sudoc', {
        params: { query, title: titleQuery, limit: 20 },
        headers,
      });
      setResults(resp.data);
      setSelected(null);
      setFields([]);
    } catch (err) {
      console.error(err);
      setSearchError(err.response?.data?.detail || 'Search failed');
    } finally {
      setSearchLoading(false);
    }
  };

  // Load a full record with auth header
  const loadRecord = async (rec) => {
    setLoadError('');
    setLoadLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const resp = await axios.get(`/catalog/sudoc/sudoc/${rec.id}`, { headers });
      setSelected(rec);
      setFields(resp.data);
    } catch (err) {
      console.error(err);
      setLoadError(err.response?.data?.detail || 'Load record failed');
    } finally {
      setLoadLoading(false);
    }
  };

  const updateField = (idx, key, value) => {
    setFields(fields.map((f, i) => (i === idx ? { ...f, [key]: value } : f)));
  };

  const add852Holding = () => {
    setFields([
      ...fields,
      { tag: '852', ind1: ' ', ind2: ' ', subfields: { h: '', j: '' } },
    ]);
  };

  // Export modified record with auth header
  const exportRecord = async () => {
    setExportError('');
    setExportSuccess('');
    setExportLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const payload = { records: [{ id: selected.id, fields }] };
      const resp = await axios.post('/catalog/sudoc/sudoc-export', payload, {
        headers,
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([resp.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${selected.sudoc.replace(/\s+/g, '_')}.mrc`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setExportSuccess('Export successful! Your download should begin shortly.');
    } catch (err) {
      console.error(err);
      setExportError(err.response?.data?.detail || 'Export failed');
    } finally {
      setExportLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-2xl font-semibold mb-4">SuDoc Search</h2>
        {searchError && <div className="text-red-600 mb-2">{searchError}</div>}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input
            type="text"
            className="border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring focus:border-blue-300"
            placeholder="Call Number (partial or full)"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <input
            type="text"
            className="border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring focus:border-blue-300"
            placeholder="Title (partial or full)"
            value={titleQuery}
            onChange={e => setTitleQuery(e.target.value)}
          />
          <button
            onClick={handleSearch}
            disabled={searchLoading}
            className={`font-medium rounded px-4 py-2 transition ${searchLoading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
          >
            {searchLoading ? 'Searching...' : 'Search'}
          </button>
        </div>
      </div>

      {results.length > 0 && (
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-xl font-semibold mb-4">Results</h3>
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">SuDoc</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {results.map(rec => (
                <tr key={rec.id}>
                  <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700">{rec.sudoc}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700">{rec.title}</td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <button
                      onClick={() => loadRecord(rec)}
                      disabled={loadLoading && selected?.id === rec.id}
                      className={`font-medium rounded px-3 py-1 transition ${loadLoading && selected?.id === rec.id ? 'bg-gray-400' : 'bg-green-500 hover:bg-green-600 text-white'}`}
                    >
                      {loadLoading && selected?.id === rec.id ? 'Loading...' : 'Edit'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {loadError && <div className="text-red-600 mt-2">{loadError}</div>}
        </div>
      )}

      {selected && (
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-xl font-semibold mb-4">Editing: {selected.sudoc}</h3>
          <div className="space-y-4">
            {fields.map((f, idx) => (
              <div key={idx} className="flex items-center space-x-2">
                <input
                  value={f.tag}
                  readOnly
                  className="w-12 border border-gray-300 rounded px-2 py-1 bg-gray-100"
                />
                <input
                  value={f.ind1}
                  onChange={e => updateField(idx, 'ind1', e.target.value)}
                  className="w-12 border border-gray-300 rounded px-2 py-1"/>
                <input
                  value={f.ind2}
                  onChange={e => updateField(idx, 'ind2', e.target.value)}
                  className="w-12 border border-gray-300 rounded px-2 py-1"/>
                <input
                  type="text"
                  value={Object.entries(f.subfields).map(([k,v]) => `$${k} ${v}`).join(' ')}
                  onChange={e => {
                    const parts = e.target.value.split(' $').slice(1);
                    const newSubs = {};
                    parts.forEach(p => {
                      const [k, ...rest] = p.split(' ');
                      newSubs[k] = rest.join(' ');
                    });
                    updateField(idx, 'subfields', newSubs);
                  }}
                  className="flex-1 border border-gray-300 rounded px-2 py-1"
                />
              </div>
            ))}
          </div>
          {exportError && <div className="text-red-600 mt-2">{exportError}</div>}
          {exportSuccess && <div className="text-green-600 mt-2">{exportSuccess}</div>}
          <div className="mt-4 flex space-x-2">
            <button
              onClick={add852Holding}
              className="bg-yellow-500 text-white rounded px-3 py-1 hover:bg-yellow-600 transition"
            >
              Add 852
            </button>
            <button
              onClick={exportRecord}
              disabled={exportLoading}
              className={`font-medium rounded px-3 py-1 transition ${exportLoading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
            >
              {exportLoading ? 'Exporting...' : 'Save & Download'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
