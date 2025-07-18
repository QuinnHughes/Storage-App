import React, { useState } from "react";

export default function AccessionSlots() {
  const [mode, setMode] = useState("slots"); // "slots" or "shelves"
  const [count, setCount] = useState(10); // number of slots or shelves
  const [itemsPerShelf, setItemsPerShelf] = useState(1); // only for shelves mode
  const [pairs, setPairs] = useState([]);
  const [labelText, setLabelText] = useState("");
  const [error, setError] = useState("");

  function getAuthHeaders() {
    const token = localStorage.getItem("token");
    if (!token) throw new Error("Not authenticated");
    return { Authorization: `Bearer ${token}` };
  }

  async function fetchSlots() {
    setError("");
    try {
      const headers = getAuthHeaders();
      let data;
      if (mode === "slots") {
        const res = await fetch(`/api/accession/empty-slots?limit=${count}`, { headers, credentials: "include" });
        if (res.status === 401) throw new Error("Session expired – please log in again.");
        if (!res.ok) throw new Error(`Error ${res.status}: ${res.statusText}`);
        data = await res.json();
        setPairs(data.map(acn => ({ barcode: "", alternative_call_number: acn })));
      } else {
        // shelves mode
        const res = await fetch(`/api/accession/empty-shelves?limit=${count}`, { headers, credentials: "include" });
        if (res.status === 401) throw new Error("Session expired – please log in again.");
        if (!res.ok) throw new Error(`Error ${res.status}: ${res.statusText}`);
        const shelves = await res.json();
        // expand each shelf into itemsPerShelf entries
        const expanded = shelves.flatMap(acn =>
          Array.from({ length: itemsPerShelf }, () => ({ barcode: "", alternative_call_number: acn }))
        );
        setPairs(expanded);
      }
      setLabelText("");
    } catch (e) {
      console.error(e);
      setError(e.message);
      setPairs([]);
    }
  }

  function updateBarcode(index, value) {
    setPairs(prev => {
      const updated = [...prev];
      updated[index].barcode = value;
      return updated;
    });
  }

  function exportCSV() {
    const headers = ["Barcode", "Call Number"];
    const rows = pairs.map(p => [p.barcode || "", p.alternative_call_number]);
    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", mode === "slots" ? "accession_slots.csv" : "accession_shelves.csv");
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function genLabels() {
    setError("");
    try {
      const headers = { ...getAuthHeaders(), "Content-Type": "application/json" };
      const res = await fetch(`/api/accession/labels`, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify(pairs)
      });
      if (res.status === 401) throw new Error("Session expired – please log in again.");
      if (!res.ok) throw new Error(`Error ${res.status}: ${res.statusText}`);
      setLabelText(await res.text());
    } catch (e) {
      console.error(e);
      setError(e.message);
    }
  }

  return (
    <div className="max-w-100% mx-auto p-6 bg-gray-50 rounded-2xl shadow-lg">
      <h1 className="text-2xl font-bold mb-4 text-indigo-700">Accession {mode === "slots" ? "Slots" : "Shelves"}</h1>

      <div className="flex items-center space-x-4 mb-4">
        <label className="flex items-center">
          <input
            type="radio"
            value="slots"
            checked={mode === "slots"}
            onChange={() => setMode("slots")}
            className="mr-2"
          />
          Empty Slots
        </label>
        <label className="flex items-center">
          <input
            type="radio"
            value="shelves"
            checked={mode === "shelves"}
            onChange={() => setMode("shelves")}
            className="mr-2"
          />
          Empty Shelves
        </label>
      </div>

      <div className="flex items-center space-x-3 mb-4">
        <div>
          <label className="block text-gray-700">Number of {mode === "slots" ? "slots" : "shelves"}:</label>
          <input
            type="number"
            min={1}
            value={count}
            onChange={e => setCount(+e.target.value)}
            className="w-24 p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>
        {mode === "shelves" && (
          <div>
            <label className="block text-gray-700">Items per shelf:</label>
            <input
              type="number"
              min={1}
              value={itemsPerShelf}
              onChange={e => setItemsPerShelf(+e.target.value)}
              className="w-24 p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
        )}
        <button
          onClick={fetchSlots}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
        >
          Get {mode === "slots" ? "Slots" : "Shelves"}
        </button>
      </div>

      {error && <div className="text-red-500 mb-4">Error: {error}</div>}

      {pairs.length > 0 && (
        <>
          <table className="min-w-full bg-white rounded-lg overflow-hidden shadow">
            <thead className="bg-indigo-100">
              <tr>
                <th className="px-4 py-2 text-left text-indigo-600">Barcode</th>
                <th className="px-4 py-2 text-left text-indigo-600">Call Number</th>
              </tr>
            </thead>
            <tbody>
              {pairs.map((p, i) => (
                <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : "bg-white"}>
                  <td className="px-4 py-2">
                    <input
                      type="text"
                      value={p.barcode}
                      onChange={e => updateBarcode(i, e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                  </td>
                  <td className="px-4 py-2 font-mono text-sm text-gray-700">{p.alternative_call_number}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex space-x-3 mt-4">
            <button
              onClick={exportCSV}
              className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition"
            >
              Export CSV
            </button>
            <button
              onClick={genLabels}
              className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition"
            >
              Generate Labels
            </button>
          </div>

          {labelText && (
            <textarea
              readOnly
              rows={10}
              className="w-full mt-4 p-4 border border-gray-300 rounded-lg font-mono text-sm bg-gray-100"
              value={labelText}
            />
          )}
        </>
      )}
    </div>
  );
}
