// src/pages/SudocEditor.jsx
import React, { useEffect, useState } from "react";
import axios from "axios";

export default function SudocEditor({ records }) {
  const [recs, setRecs]   = useState(records || []);
  const [marcs, setMarcs] = useState({});

  // load checked-out if navigated here directly
  useEffect(() => {
    try {
      const arr = JSON.parse(localStorage.getItem("checkedOut")) || [];
      setRecs(arr);
    } catch {}
  }, []);

  // fetch MARC for each record
  useEffect(() => {
    setMarcs({});
    const token = localStorage.getItem("token");
    recs.forEach(async (r) => {
      try {                             //Worcat record api needs to go here once I chat with Oscar
        const { data } = await axios.get(`/catalog/sudoc/${r.id}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        setMarcs((m) => ({ ...m, [r.id]: data }));
      } catch (err) {
        console.error(`Failed to fetch MARC for ${r.id}`, err);
      }
    });
  }, [recs]);

  if (!recs.length) {
    return <p className="italic p-4">No records selected for editing.</p>;
  }

  return (
    <div className="p-6 space-y-6">
      {recs.map((r) => (
        <div key={r.id} className="bg-white p-4 rounded shadow">
          <h4 className="font-semibold">{r.title}</h4>
          <p>
            <strong>SuDoc:</strong> {r.sudoc}
            &nbsp;<strong>OCLC:</strong> {r.oclc || "—"}
          </p>
          <div className="mt-2">
            {marcs[r.id] ? (
              <pre className="text-sm bg-gray-100 p-2 rounded overflow-auto">
                {JSON.stringify(marcs[r.id], null, 2)}
              </pre>
            ) : (
              <p className="italic">Loading MARC…</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
