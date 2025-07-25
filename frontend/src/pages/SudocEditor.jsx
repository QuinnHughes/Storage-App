// src/pages/SudocEditor.jsx
import React, { useEffect, useState } from "react";
import apiFetch from '../api/client';

export default function SudocEditor() {
  const [records, setRecords] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [marcFields, setMarcFields] = useState({}); // { [recordId]: MarcFieldOut[] }
  const [loadingIds, setLoadingIds] = useState(new Set());

  // 1) Load all checked-out items on mount
  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem("checkedOut") || "[]");
    setRecords(saved);
    if (saved.length) setSelectedId(saved[0].id);
  }, []);

  // 2) For each record, fetch its MARC fields from the backend (which will pull from Record_sets)
useEffect(() => {
  records.forEach((rec) => {
    if (!marcFields[rec.id] && !loadingIds.has(rec.id)) {
      setLoadingIds((prev) => new Set(prev).add(rec.id));

        apiFetch(`/catalog/sudoc/sudoc/${rec.id}`, {
          headers: localStorage.getItem("token")
            ? { Authorization: `Bearer ${localStorage.getItem("token")}` }
            : {},
        })
        .then(async res => {
          if (!res.ok) throw new Error(`Status ${res.status}`);
          const data = await res.json();
          setMarcFields(prev => ({ ...prev, [rec.id]: data }));
        })
        .catch(err => {
          console.error(`Error fetching MARC for ${rec.id}:`, err);
        })
        .finally(() => {
          setLoadingIds(prev => {
            const next = new Set(prev);
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

  const selected = records.find((r) => r.id === selectedId);
  const fields  = selectedId ? marcFields[selectedId] : null;
  const isLoading = loadingIds.has(selectedId);

  return (
    <div className="flex flex-col md:flex-row p-6 max-w-100% mx-auto space-y-6 md:space-y-0 md:space-x-6">
      {/* Sidebar */}
      <aside className="md:w-1/4 bg-gray-50 p-4 rounded-lg overflow-y-auto">
        <h3 className="text-lg font-semibold mb-4">Checked-out Items</h3>
        {!records.length && (
          <p className="italic text-gray-600">
            No items checked out. Go back to search and checkout.
          </p>
        )}
        <ul className="space-y-2">
          {records.map((rec) => (
            <li
              key={rec.id}
              className="flex items-center justify-between"
            >
              <button
                onClick={() => setSelectedId(rec.id)}
                className={`text-left flex-1 p-2 rounded transition ${
                  rec.id === selectedId
                    ? "bg-blue-100 font-semibold"
                    : "hover:bg-gray-100"
                }`}
              >
                {rec.title || rec.sudoc}
              </button>
              <button
                onClick={() => handleRemove(rec.id)}
                className="text-red-500 text-sm hover:underline ml-2"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* Main Editor Pane */}
      <main className="flex-1 bg-white p-6 rounded-lg shadow overflow-y-auto">
        {!selected ? (
          <p className="italic text-gray-600">Select an item to edit.</p>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold">
                {selected.title || selected.sudoc}
              </h2>
              <button
                onClick={() => handleRemove(selected.id)}
                className="text-red-500 hover:underline"
              >
                Remove
              </button>
            </div>

            {/* Metadata */}
            <p className="mb-6">
              <span className="font-semibold">SuDoc:</span> {selected.sudoc}{" "}
              <span className="ml-4 font-semibold">OCLC:</span>{" "}
              {selected.oclc || "—"}
            </p>

            {/* Local MARC Fields */}
            <section className="mb-6">
              <h3 className="font-semibold mb-2">Local MARC Fields</h3>

              {isLoading ? (
                <p className="italic text-gray-600">Loading local MARC…</p>
              ) : !fields ? (
                <p className="italic text-gray-600">No MARC data found.</p>
              ) : (
                <div className="overflow-auto max-h-80 border rounded">
                  <table className="w-full table-auto text-sm">
                    <thead className="bg-gray-100 sticky top-0">
                      <tr>
                        <th className="px-2 py-1 text-left">Tag</th>
                        <th className="px-2 py-1 text-left">Ind</th>
                        <th className="px-2 py-1 text-left">Subfields</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fields.map((f, i) => (
                        <tr
                          key={i}
                          className={i % 2 ? "bg-white" : "bg-gray-50"}
                        >
                          <td className="px-2 py-1">{f.tag}</td>
                          <td className="px-2 py-1">
                            {f.ind1}
                            {f.ind2}
                          </td>
                          <td className="px-2 py-1">
                            {Object.entries(f.subfields)
                              .map(([code, val]) => `$${code} ${val}`)
                              .join(" ")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* WorldCat stub */}
            <section className="mb-6">
              <h3 className="font-semibold mb-2">
                WorldCat MARC{" "}
                <span className="text-sm text-gray-500">(Unavailable)</span>
              </h3>
              <p className="italic text-gray-500">
                WorldCat integration isn’t available right now.
              </p>
            </section>

            {/* Editor placeholder */}
            <section className="mt-6">
              <h3 className="font-semibold mb-2">Field-level Editing</h3>
              <p className="text-gray-600">
                Not quite ready so just use your imagination here.
              </p>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
