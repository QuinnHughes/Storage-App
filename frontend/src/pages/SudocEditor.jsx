// src/pages/SudocEditor.jsx
import React, { useState, useEffect, useCallback } from "react";
import apiFetch from '../api/client';
import { useSudocCarts } from '../hooks/useSudocCarts';

export default function SudocEditor() {
  const [records, setRecords] = useState([]);             // checked-out items
  const [selectedId, setSelectedId] = useState(null);     // currently viewed
  const [marcFields, setMarcFields] = useState({});       // { [id]: MarcFieldOut[] | null }
  const [loadingIds, setLoadingIds] = useState(new Set());
  const [editingField, setEditingField] = useState(null);
  const [editedFields, setEditedFields] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [workingMode, setWorkingMode] = useState('checkout'); // 'checkout' or 'cart'
  const [showAddField, setShowAddField] = useState(false);
  const [newField945, setNewField945] = useState({
    l: 'ssy', // default location
    i: '',    // barcode
    c: '',    // call number
    n: ''     // enumeration/chronology
  });

  const { 
    carts, 
    selectedCart,
    setSelectedCart,
    createCart,
    addToCart,
    removeFromCart,
    deleteCart
  } = useSudocCarts();

  // Calculate selected record - moved before callbacks that use it
  const selected = records.find((r) => r.id === selectedId);
  const fields = selectedId != null ? marcFields[selectedId] : null;
  const isLoading = loadingIds.has(selectedId);

  // Helper function to truncate title with call number
  const formatItemDisplay = (item) => {
    const maxTitleLength = 50;
    let title = item.title || 'Untitled';
    if (title.length > maxTitleLength) {
      title = title.substring(0, maxTitleLength) + '...';
    }
    return `${title} [${item.sudoc}]`;
  };

  // Load checked-out list on mount
  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem("checkedOut") || "[]");
    setRecords(saved);
    if (saved.length) setSelectedId(saved[0].id);
  }, []);

  // When cart selection changes, update records and working mode
  useEffect(() => {
    const fetchCartRecords = async () => {
      if (selectedCart && carts) {
        try {
          const token = localStorage.getItem("token");
          const res = await apiFetch(`/catalog/sudoc/carts/${selectedCart}/records`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          
          if (!res.ok) {
            throw new Error(`Failed to fetch cart records: ${res.status}`);
          }
          
          const cartRecords = await res.json();
          setRecords(cartRecords);
          setWorkingMode('cart');
          setSelectedId(cartRecords[0]?.id || null);
        } catch (err) {
          console.error('Failed to fetch cart records:', err);
          setRecords([]);
          setWorkingMode('cart');
          setSelectedId(null);
        }
      } else if (workingMode === 'cart') {
        // Switch back to checked-out items
        const saved = JSON.parse(localStorage.getItem("checkedOut") || "[]");
        setRecords(saved);
        setWorkingMode('checkout');
        setSelectedId(saved[0]?.id || null);
      }
    };

    fetchCartRecords();
  }, [selectedCart, carts]);

  // Fetch MARC fields for any new record exactly once
  useEffect(() => {
    records.forEach((rec) => {
      // Make sure rec.id exists and is valid
      if (rec && rec.id && !(rec.id in marcFields) && !loadingIds.has(rec.id)) {
        setLoadingIds((s) => new Set(s).add(rec.id));
        apiFetch(`/catalog/sudoc/${rec.id}`, {
          headers: localStorage.getItem("token")
            ? { Authorization: `Bearer ${localStorage.getItem("token")}` }
            : {},
        })
          .then(async (res) => {
            if (!res.ok) throw new Error(`Status ${res.status}`);
            const data = await res.json();
            setMarcFields((prev) => ({ ...prev, [rec.id]: data }));
          })
          .catch((err) => {
            console.error(`Error fetching MARC for ${rec.id}:`, err);
            setMarcFields((prev) => ({ ...prev, [rec.id]: null }));
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

  const handleRemove = async (id) => {
    if (workingMode === 'cart' && selectedCart) {
      // Remove from cart
      try {
        await removeFromCart(id);
        const updated = records.filter((r) => r.id !== id);
        setRecords(updated);
        if (selectedId === id) setSelectedId(updated[0]?.id || null);
      } catch (err) {
        console.error('Failed to remove from cart:', err);
      }
    } else {
      // Remove from checked-out items
      const updated = records.filter((r) => r.id !== id);
      localStorage.setItem("checkedOut", JSON.stringify(updated));
      setRecords(updated);
      if (selectedId === id) setSelectedId(updated[0]?.id || null);
    }
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

  // Update the handleSaveField function to connect to your existing backend endpoint
  const handleSaveField = async (fieldIndex, updatedField) => {
    if (!selectedId) return;
    
    setIsSaving(true);
    try {
      const response = await apiFetch(`/catalog/sudoc/${selectedId}/field/${fieldIndex}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify(updatedField)
      });

      if (!response.ok) {
        throw new Error('Failed to save field');
      }

      const savedField = await response.json();
      
      // Update the local state with the saved field
      setMarcFields(prev => ({
        ...prev,
        [selectedId]: prev[selectedId].map((field, index) => 
          index === fieldIndex ? savedField : field
        )
      }));

      // Clear editing state
      setEditingField(null);
      setEditedFields({});
      
      console.log('Field saved successfully');
      
    } catch (error) {
      console.error('Failed to save field:', error);
      alert('Failed to save field. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const updateField945 = useCallback((field, value) => {
    setNewField945(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleAdd945Field = useCallback(async () => {
    if (!selected) return;
    
    // Validate required fields
    if (!newField945.i.trim()) {
      alert('Barcode is required');
      return;
    }
    
    const newFieldData = {
      tag: "945",
      ind1: " ",
      ind2: " ",
      subfields: {
        l: newField945.l,
        i: newField945.i,
        c: newField945.c,
        n: newField945.n
      }
    };

    try {
      const res = await apiFetch(`/catalog/sudoc/${selected.id}/field/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(newFieldData)
      });

      if (!res.ok) {
        const error = await res.text();
        throw new Error(error || 'Failed to add field');
      }

      const addedField = await res.json();

      // Update local state with the new field
      setMarcFields(prev => ({
        ...prev,
        [selected.id]: [...(prev[selected.id] || []), addedField]
      }));

      // Reset form and close modal
      setNewField945({
        l: 'ssy',
        i: '',
        c: '',
        n: ''
      });
      setShowAddField(false);
    } catch (err) {
      console.error('Error adding 945 field:', err);
      alert(err.message || 'Failed to add field');
    }
  }, [selected, newField945]);

  // Cart management functions
  const handleCreateCart = async () => {
    const name = prompt('Enter cart name:');
    if (name) {
      try {
        await createCart(name);
      } catch (err) {
        console.error('Failed to create cart:', err);
      }
    }
  };

  const handleSwitchToCheckout = () => {
    setSelectedCart(null);
    const saved = JSON.parse(localStorage.getItem("checkedOut") || "[]");
    setRecords(saved);
    setWorkingMode('checkout');
    setSelectedId(saved[0]?.id || null);
  };

  // Cart Selector Component
  const CartSelector = () => (
    <div className="bg-white rounded-lg shadow p-4 mb-6">
      <h3 className="text-lg font-semibold mb-3">Work Mode</h3>
      <div className="flex items-center space-x-4 mb-4">
        <button
          onClick={handleSwitchToCheckout}
          className={`px-4 py-2 rounded-lg ${
            workingMode === 'checkout'
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Checked-out Items
        </button>
        <span className="text-gray-400">|</span>
        <select 
          value={selectedCart || ''} 
          onChange={(e) => setSelectedCart(e.target.value ? Number(e.target.value) : null)}
          className="border p-2 rounded flex-1"
        >
          <option value="">Select a cart...</option>
          {carts.map(cart => (
            <option key={cart.id} value={cart.id}>
              {cart.name} ({cart.items?.length || 0} items)
            </option>
          ))}
        </select>
        <button
          onClick={handleCreateCart}
          className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded"
        >
          + New Cart
        </button>
      </div>
      
      {selectedCart && (
        <div className="flex items-center space-x-4">
          <span className="text-sm text-gray-600">
            Working with cart: <strong>{carts.find(c => c.id === selectedCart)?.name}</strong>
          </span>
          <button
            onClick={() => {
              if (window.confirm('Are you sure you want to delete this cart?')) {
                deleteCart(selectedCart);
              }
            }}
            className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm"
          >
            Delete Cart
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="p-6 space-y-6 bg-gray-100 min-h-screen">
      <CartSelector />
      
      <div className="flex flex-col md:flex-row space-y-6 md:space-y-0 md:space-x-6">
        {/* Sidebar */}
        <aside className="md:w-1/3 bg-white p-6 rounded-lg shadow-md border border-gray-200">
          <h3 className="text-xl font-bold text-gray-800 mb-4 pb-2 border-b border-gray-200">
            {workingMode === 'cart' ? `Cart Items` : 'Checked-out Items'}
            <span className="text-sm font-normal text-gray-600 ml-2">
              ({records.length})
            </span>
          </h3>
          {!records.length && (
            <p className="italic text-gray-600">
              {workingMode === 'cart' 
                ? 'No items in this cart.' 
                : 'No items checked out. Go back to search and checkout.'
              }
            </p>
          )}
          <ul className="space-y-2">
            {records.filter(rec => rec && rec.id).map((rec) => (
              <li key={`record-${rec.id}`} className="relative group">
                <button
                  onClick={() => setSelectedId(rec.id)}
                  className={`w-full text-left p-3 rounded-lg transition duration-150 ${
                    rec.id === selectedId
                      ? "bg-blue-50 text-blue-700 font-medium border border-blue-200"
                      : "hover:bg-gray-50 text-gray-700"
                  }`}
                >
                  <div className="text-sm leading-tight">
                    {formatItemDisplay(rec)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    OCLC: {rec.oclc || "—"}
                  </div>
                </button>
                <button
                  onClick={() => handleRemove(rec.id)}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 bg-red-500 hover:bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs transition-opacity"
                  title="Remove from list"
                >
                  ×
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
                    {formatItemDisplay(selected)}
                  </h2>
                  <div className="space-x-3">
                    <button
                      onClick={() => download([selected.id])}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition duration-150"
                    >
                      Download
                    </button>
                  </div>
                </div>
                <div className="mt-2 text-gray-600">
                  <span className="font-medium">OCLC:</span>{" "}
                  {selected.oclc || "—"}
                </div>
              </div>

              {/* Local MARC Fields */}
              <div className="p-6">
                <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
                  <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                    <h3 className="text-lg font-bold text-gray-800">
                      Local MARC Fields
                    </h3>
                    <button
                      onClick={() => setShowAddField(true)}
                      className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition duration-150"
                    >
                      + Add 945 Field
                    </button>
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
                            <tr key={`field-${index}-${field.tag}`} className="hover:bg-gray-50 transition-colors">
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
                                          if (code && value) {
                                            subfields[code] = value;
                                          }
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
                                      onClick={() => handleSaveField(index, editedFields[index] || field)}
                                      disabled={isSaving}
                                      className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                                    >
                                      {isSaving ? 'Saving...' : 'Save'}
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
                                        <span key={`subfield-${code}`} className="mr-2">
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
      
      {/* Add Field Modal */}
      {showAddField && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Add 945 Holdings Field</h3>
              <button
                onClick={() => setShowAddField(false)}
                className="text-gray-400 hover:text-gray-600 text-xl"
              >
                ×
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Location ($l)
                </label>
                <input
                  type="text"
                  value={newField945.l}
                  onChange={(e) => updateField945('l', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="ssy"
                  autoComplete="off"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Barcode ($i) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newField945.i}
                  onChange={(e) => updateField945('i', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="u184018606593"
                  required
                  autoComplete="off"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Call Number ($c)
                </label>
                <input
                  type="text"
                  value={newField945.c}
                  onChange={(e) => updateField945('c', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="S-1-01B-01-01-001"
                  autoComplete="off"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Enumeration/Chronology ($n)
                </label>
                <input
                  type="text"
                  value={newField945.n}
                  onChange={(e) => updateField945('n', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="v.42"
                  autoComplete="off"
                />
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowAddField(false)}
                className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd945Field}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Add Field
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
