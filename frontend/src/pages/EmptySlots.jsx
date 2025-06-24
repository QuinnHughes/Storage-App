//EmptySlots: Uses view empty_slot_details against the main "items" database to predict empty spaces and where they should be. 
//To-do: Needs view adjusted to view weeding list aswell, could potentitally do a seperate view that looks at a table of weeded items.
//To-do cont: Add in on this or in a new sheet ability to select a pre definable template for accesionning, xlsx for item updater by excel and for zebra batch print(probaly will need an api)

import { useEffect, useState } from 'react';

const EmptySlots = () => {
  const [slots, setSlots]         = useState([]);
  const [filtered, setFiltered]   = useState([]);
  const [filters, setFilters]     = useState({ floor: '', range: '', ladder: '', shelf: '' });
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);

  // ── FETCH EFFECT ───────────────────────────────────────────────────────────
  useEffect(() => {
    const fetchSlots = async () => {
      setLoading(true);
      setError(null);

      try {
        const token = localStorage.getItem('token');
        if (!token) throw new Error('Not authenticated');

        const res = await fetch("/catalog/search/empty-slot-details", {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        if (res.status === 401) {
          throw new Error('Session expired – please log in again.');
        }
        if (!res.ok) {
          throw new Error(`Server error: ${res.status}`);
        }

        const data = await res.json();
        setSlots(data);
        setFiltered(data);
      } catch (err) {
        console.error("Error fetching empty slots:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchSlots();
  }, []);
  
  useEffect(() => {
const result = slots.filter(slot => {
  return (
    (!filters.floor || slot.floor.toString() === filters.floor) &&
    (!filters.range || slot.range === filters.range) &&
    (!filters.ladder || slot.ladder.toString().padStart(2, '0') === filters.ladder) &&
    (!filters.shelf || slot.shelf.toString().padStart(2, '0') === filters.shelf)
  );
});

    setFiltered(result);
  }, [filters, slots]);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

 const getUnique = (key) => [...new Set(slots.map(slot => slot[key]?.toString().padStart(2, '0')).filter(Boolean))];

  const exportCSV = () => {
    const headers = ['alternative_call_number'];
    const rows = filtered.map(slot => {
      const acn = `S-${slot.floor}-${slot.range}-${slot.ladder}-${slot.shelf}-${slot.empty_position}`;
      return [acn];
    });
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'empty_slots.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) return <div className="p-4 text-center">Loading...</div>;
  if (error) return <div className="p-4 text-red-500">{error}</div>;

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">Empty Shelf Slots</h1>

      <div className="flex flex-wrap gap-4 mb-4">
        <select name="floor" value={filters.floor} onChange={handleFilterChange} className="border px-2 py-1">
          <option value="">All Floors</option>
          {getUnique('floor').map(val => <option key={val} value={val}>{val}</option>)}
        </select>
        <select name="range" value={filters.range} onChange={handleFilterChange} className="border px-2 py-1">
          <option value="">All Ranges</option>
          {getUnique('range').map(val => <option key={val} value={val}>{val}</option>)}
        </select>
        <select name="ladder" value={filters.ladder} onChange={handleFilterChange} className="border px-2 py-1">
          <option value="">All Ladders</option>
          {getUnique('ladder').map(val => <option key={val} value={val}>{val}</option>)}
        </select>
        <select name="shelf" value={filters.shelf} onChange={handleFilterChange} className="border px-2 py-1">
          <option value="">All Shelves</option>
          {getUnique('shelf').map(val => <option key={val} value={val}>{val}</option>)}
        </select>
        <button onClick={exportCSV} className="ml-auto bg-blue-600 text-white px-4 py-1 rounded">Export CSV</button>
      </div>

      <div className="overflow-x-auto">
        <table className="table-auto w-full border border-gray-300 text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="px-4 py-2 border">Floor</th>
              <th className="px-4 py-2 border">Range</th>
              <th className="px-4 py-2 border">Ladder</th>
              <th className="px-4 py-2 border">Shelf</th>
              <th className="px-4 py-2 border">Empty Position</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((slot, idx) => (
              <tr key={idx} className="odd:bg-white even:bg-gray-50">
                <td className="px-4 py-1 border text-center">{slot.floor}</td>
                <td className="px-4 py-1 border text-center">{slot.range}</td>
                <td className="px-4 py-1 border text-center">{slot.ladder}</td>
                <td className="px-4 py-1 border text-center">{slot.shelf}</td>
                <td className="px-4 py-1 border text-center">{slot.empty_position}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default EmptySlots;
