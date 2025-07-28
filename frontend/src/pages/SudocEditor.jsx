// src/pages/SudocEditor.jsx
import React, { useEffect, useState } from "react";
import apiFetch from "../api/client";

export default function SudocEditor() {
  const [records, setRecords] = useState([]);             // checked-out items
  const [selectedId, setSelectedId] = useState(null);     // currently viewed
  const [marcFields, setMarcFields] = useState({});       // { [id]: MarcFieldOut[] | null }
  const [loadingIds, setLoadingIds] = useState(new Set());
  const [editingField, setEditingField] = useState(null);
  const [editedFields, setEditedFields] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  // Load checked-out list on mount
  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem("checkedOut") || "[]");
    setRecords(saved);
    if (saved.length) setSelectedId(saved[0].id);
  }, []);

  // Fetch MARC fields for any new record exactly once
  useEffect(() => {
    records.forEach((rec) => {
      if (!(rec.id in marcFields) && !loadingIds.has(rec.id)) {
        setLoadingIds((s) => new Set(s).add(rec.id));
        apiFetch(`/catalog/sudoc/${rec.id}`, {
          headers: localStorage.getItem("token")
            ? { Authorization: `Bearer ${localStorage.getItem("token")}` }
            : {},
        })
          .then(async (res) => {
            if (!res.ok) throw new Error(`Status ${res.status}`);
            const data = await res.json();
            setMarcFields((m) => ({ ...m, [rec.id]: data }));
          })
          .catch((err) => {
            console.error(`Error fetching MARC for ${rec.id}:`, err);
            // mark as “fetched, but empty” so we don’t retry forever
            setMarcFields((m) => ({ ...m, [rec.id]: null }));
          })
          .finally(() => {
            setLoadingIds((s) => {
              const next = new Set(s);
              next.delete(rec.id);
              return next;
            });
          });
      }
    });
  }, [records, marcFields, loadingIds]);

  const handleRemove = (id) => {
    const updated = records.filter((r) => r.id !== id);
    localStorage.setItem("checkedOut", JSON.stringify(updated));
    setRecords(updated);
    if (selectedId === id) setSelectedId(updated[0]?.id || null);
  };

  // Download helper
  const download = async (ids) => {
    if (!ids.length) return;
    const res = await apiFetch("/catalog/sudoc/export", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(localStorage.getItem("token")
          ? { Authorization: `Bearer ${localStorage.getItem("token")}` }
          : {}),
      },
      body: JSON.stringify({ record_ids: ids }),
    });
    if (!res.ok) {
      console.error("Export failed:", await res.text());
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download =
      ids.length > 1 ? "sudoc_export.mrc" : `record_${ids[0]}.mrc`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // Update the handleSaveField function
  const handleSaveField = async (fieldIndex) => {
    if (!selected || !editedFields[fieldIndex]) return;
    
    setIsSaving(true);
    try {
      const res = await apiFetch(`/catalog/sudoc/${selected.id}/field/${fieldIndex}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(editedFields[fieldIndex])
      });

      if (!res.ok) {
        const error = await res.text();
        throw new Error(error || 'Failed to save changes');
      }

      const updatedField = await res.json();

      // Update local state with the returned field data
      setMarcFields(prev => ({
        ...prev,
        [selected.id]: prev[selected.id].map((f, i) => 
          i === fieldIndex ? updatedField : f
        )
      }));
      setEditingField(null);
      setEditedFields(prev => {
        const next = { ...prev };
        delete next[fieldIndex];
        return next;
      });
    } catch (err) {
      console.error('Error saving field:', err);
      alert(err.message || 'Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  const selected = records.find((r) => r.id === selectedId);
  const fields = selectedId != null ? marcFields[selectedId] : null;
  const isLoading = loadingIds.has(selectedId);

  return (
    <div className="flex flex-col md:flex-row p-6 space-y-6 md:space-y-0 md:space-x-6 bg-gray-100 min-h-screen">
      {/* Sidebar */}
      <aside className="md:w-1/4 bg-white p-6 rounded-lg shadow-md border border-gray-200">
        <h3 className="text-xl font-bold text-gray-800 mb-4 pb-2 border-b border-gray-200">
          Checked-out Items
        </h3>
        {!records.length && (
          <p className="italic text-gray-600">
            No items checked out. Go back to search and checkout.
          </p>
        )}
        <ul className="space-y-2">
          {records.map((rec) => (
            <li key={rec.id}>
              <button
                onClick={() => setSelectedId(rec.id)}
                className={`w-full text-left p-3 rounded-lg transition duration-150 ${
                  rec.id === selectedId
                    ? "bg-blue-50 text-blue-700 font-medium border border-blue-200"
                    : "hover:bg-gray-50 text-gray-700"
                }`}
              >
                {rec.title || rec.sudoc}
              </button>
            </li>
          ))}
        </ul>
        {records.length > 0 && (
          <button
            onClick={() => download(records.map((r) => r.id))}
            className="mt-6 w-full bg-green-600 hover:bg-green-700 text-white py-2.5 px-4 rounded-lg transition duration-150 flex items-center justify-center"
          >
            Download All Records
          </button>
        )}
      </aside>

      {/* Main Editor Pane */}
      <main className="flex-1 bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
        {!selected ? (
          <div className="p-6">
            <p className="italic text-gray-600">Select an item to edit.</p>
          </div>
        ) : (
          <>
            {/* Header & Download Selected */}
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-800">
                  {selected.title || selected.sudoc}
                </h2>
                <div className="space-x-3">
                  <button
                    onClick={() => download([selected.id])}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition duration-150"
                  >
                    Download
                  </button>
                  <button
                    onClick={() => handleRemove(selected.id)}
                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition duration-150"
                  >
                    Remove
                  </button>
                </div>
              </div>
              <div className="mt-2 text-gray-600">
                <span className="font-medium">SuDoc:</span>{" "}
                {selected.sudoc}{" "}
                <span className="ml-4 font-medium">OCLC:</span>{" "}
                {selected.oclc || "—"}
              </div>
            </div>

            {/* Local MARC Fields */}
            <div className="p-6">
              <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-bold text-gray-800">
                    Local MARC Fields
                  </h3>
                </div>
                {isLoading ? (
                  <div className="p-6">
                    <p className="italic text-gray-600">
                      Loading local MARC…
                    </p>
                  </div>
                ) : fields == null ? (
                  <div className="p-6">
                    <p className="italic text-gray-600">
                      No MARC data found.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-hidden border border-gray-200 rounded-lg shadow-sm">
                    <table className="w-full table-auto text-sm">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tag</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Indicators</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Subfields</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {fields.map((field, index) => (
                          <tr key={index} className="hover:bg-gray-50 transition-colors">
                            {editingField === index ? (
                              // Edit Mode
                              <>
                                <td className="px-4 py-3">
                                  <input
                                    type="text"
                                    value={editedFields[index]?.tag || field.tag}
                                    onChange={e => setEditedFields(prev => ({
                                      ...prev,
                                      [index]: { ...prev[index] || field, tag: e.target.value }
                                    }))}
                                    className="w-16 px-2 py-1 border rounded focus:ring-2 focus:ring-blue-500"
                                    maxLength={3}
                                  />
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex gap-2">
                                    <input
                                      type="text"
                                      value={editedFields[index]?.ind1 || field.ind1}
                                      onChange={e => setEditedFields(prev => ({
                                        ...prev,
                                        [index]: { ...prev[index] || field, ind1: e.target.value }
                                      }))}
                                      className="w-8 px-2 py-1 border rounded focus:ring-2 focus:ring-blue-500"
                                      maxLength={1}
                                    />
                                    <input
                                      type="text"
                                      value={editedFields[index]?.ind2 || field.ind2}
                                      onChange={e => setEditedFields(prev => ({
                                        ...prev,
                                        [index]: { ...prev[index] || field, ind2: e.target.value }
                                      }))}
                                      className="w-8 px-2 py-1 border rounded focus:ring-2 focus:ring-blue-500"
                                      maxLength={1}
                                    />
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <input
                                    type="text"
                                    value={Object.entries(editedFields[index]?.subfields || field.subfields)
                                      .map(([code, val]) => `$${code} ${val}`).join(' ')}
                                    onChange={e => {
                                      const subfields = {};
                                      e.target.value.split('$').forEach(part => {
                                        if (!part) return;
                                        const code = part[0];
                                        const value = part.slice(1).trim();
                                        if (code && value) subfields[code] = value;
                                      });
                                      setEditedFields(prev => ({
                                        ...prev,
                                        [index]: { ...prev[index] || field, subfields }
                                      }));
                                    }}
                                    className="w-full px-2 py-1 border rounded focus:ring-2 focus:ring-blue-500 font-mono"
                                  />
                                </td>
                                <td className="px-4 py-3 text-right space-x-2">
                                  <button
                                    onClick={() => handleSaveField(index)}
                                    disabled={isSaving}
                                    className="text-green-600 hover:text-green-800"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEditingField(null);
                                      setEditedFields(prev => {
                                        const next = { ...prev };
                                        delete next[index];
                                        return next;
                                      });
                                    }}
                                    className="text-gray-600 hover:text-gray-800"
                                  >
                                    Cancel
                                  </button>
                                </td>
                              </>
                            ) : (
                              // View Mode
                              <>
                                <td className="px-4 py-3 font-mono">{field.tag}</td>
                                <td className="px-4 py-3 font-mono">{field.ind1}{field.ind2}</td>
                                <td className="px-4 py-3 font-mono">
                                  {Object.entries(field.subfields)
                                    .map(([code, val]) => (
                                      <span key={code} className="mr-2">
                                        <span className="text-blue-600">${code}</span> {val}
                                      </span>
                                    ))}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <button
                                    onClick={() => setEditingField(index)}
                                    className="text-blue-600 hover:text-blue-800"
                                  >
                                    Edit
                                  </button>
                                </td>
                              </>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
