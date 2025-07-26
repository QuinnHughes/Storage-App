import { useEffect, useState } from 'react';
import apiFetch from '../api/client';

const EmptySlots = () => {
  const [slots, setSlots] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [filters, setFilters] = useState({ floor: '', range: '', ladder: '', shelf: '' });
  const [showShelvesOnly, setShowShelvesOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [resultsPerPage, setResultsPerPage] = useState(100);

  // Fetch empty slot details
  useEffect(() => {
    const fetchSlots = async () => {
      setLoading(true);
      setError(null);
      try {
        const token = localStorage.getItem('token');
        if (!token) throw new Error('Not authenticated');

        const res = await apiFetch('/catalog/search/empty-slot-details', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.status === 401) throw new Error('Session expired – please log in again.');
        if (!res.ok) throw new Error(`Server error: ${res.status}`);

        const data = await res.json();
        setSlots(data);
        setFiltered(data);
      } catch (err) {
        console.error('Error fetching empty slots:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchSlots();
  }, []);

  // Apply filters and shelf-only toggle
  useEffect(() => {
    const result = slots.filter(slot => {
      // Check dimension filters
      const matchesFilters =
        (!filters.floor  || slot.floor.toString().padStart(2,'0') === filters.floor) &&
        (!filters.range  || slot.range                 === filters.range) &&
        (!filters.ladder || slot.ladder.toString().padStart(2, '0') === filters.ladder) &&
        (!filters.shelf  || slot.shelf.toString().padStart(2, '0')  === filters.shelf);

      // Determine display position, treating missing as 'XXX'
      const posDisplay = slot.empty_position ?? 'XXX';
      // Full-shelf hole if display position is 'XXX'
      const isShelfHole = posDisplay === 'XXX';

      return matchesFilters && (!showShelvesOnly || isShelfHole);
    });
    
    // Sort the filtered results before setting state
    const sortedResult = sortResults([...result]);
    setFiltered(sortedResult);
    setCurrentPage(1); // Reset to first page when filters change
  }, [filters, slots, showShelvesOnly]);

  const handleFilterChange = e => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const handleResultsPerPageChange = e => {
    setResultsPerPage(parseInt(e.target.value));
    setCurrentPage(1); // Reset to first page when page size changes
  };

  const getUnique = key => [
    ...new Set(
      slots.map(slot => slot[key]?.toString().padStart(2, '0')).filter(Boolean)
    )
  ];

  // Sorting function
  const sortResults = (data) => {
    return data.sort((a, b) => {
      // Sort by floor, range, ladder, shelf, position
      if (a.floor !== b.floor) return a.floor - b.floor;
      if (a.range !== b.range) return a.range.localeCompare(b.range);
      if (a.ladder !== b.ladder) return a.ladder - b.ladder;
      if (a.shelf !== b.shelf) return a.shelf - b.shelf;
      const posA = a.empty_position ?? 'XXX';
      const posB = b.empty_position ?? 'XXX';
      return posA.localeCompare(posB);
    });
  };

  // Pagination calculations
  const totalResults = filtered.length;
  const totalPages = Math.ceil(totalResults / resultsPerPage);
  const startIndex = (currentPage - 1) * resultsPerPage;
  const endIndex = startIndex + resultsPerPage;
  const currentResults = filtered
    .slice(startIndex, endIndex);

  // Pagination navigation functions
  const goToPage = (page) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  const getPageNumbers = () => {
    const pages = [];
    const maxVisiblePages = 5;
    
    if (totalPages <= maxVisiblePages) {
      // Show all pages if total is small
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Show smart pagination
      const start = Math.max(1, currentPage - 2);
      const end = Math.min(totalPages, start + maxVisiblePages - 1);
      
      if (start > 1) {
        pages.push(1);
        if (start > 2) pages.push('...');
      }
      
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      
      if (end < totalPages) {
        if (end < totalPages - 1) pages.push('...');
        pages.push(totalPages);
      }
    }
    
    return pages;
  };

  // Export CSV with padded values and XXX for shelf holes
  const exportCSV = () => {
    const headers = ['alternative_call_number'];
    const rows = filtered.map(slot => {
      const ladder = slot.ladder.toString().padStart(2, '0');
      const shelf  = slot.shelf.toString().padStart(2, '0');
      const pos    = slot.empty_position ?? 'XXX';
      const acn    = `S-${slot.floor}-${slot.range}-${ladder}-${shelf}-${pos}`;
      return [acn];
    });
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'empty_slots.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) return <div className="p-4 text-center">Loading...</div>;
  if (error)   return <div className="p-4 text-red-500">{error}</div>;

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">Empty Shelf Slots</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-4 items-center">
        <select name="floor"  value={filters.floor}  onChange={handleFilterChange} className="border px-2 py-1 rounded">
          <option value="">All Floors</option>
          {getUnique('floor').map(val => <option key={val} value={val}>{val}</option>)}
        </select>
        <select name="range"  value={filters.range}  onChange={handleFilterChange} className="border px-2 py-1 rounded">
          <option value="">All Ranges</option>
          {getUnique('range').map(val => <option key={val} value={val}>{val}</option>)}
        </select>
        <select name="ladder" value={filters.ladder} onChange={handleFilterChange} className="border px-2 py-1 rounded">
          <option value="">All Ladders</option>
          {getUnique('ladder').map(val => <option key={val} value={val}>{val}</option>)}
        </select>
        <select name="shelf"  value={filters.shelf}  onChange={handleFilterChange} className="border px-2 py-1 rounded">
          <option value="">All Shelves</option>
          {getUnique('shelf').map(val => <option key={val} value={val}>{val}</option>)}
        </select>
        <label className="flex items-center space-x-2">
          <input type="checkbox" checked={showShelvesOnly} onChange={() => setShowShelvesOnly(prev => !prev)} className="form-checkbox" />
          <span>Only Entirely Empty Shelves</span>
        </label>
      </div>

      {/* Results per page and export controls */}
      <div className="flex flex-wrap gap-4 mb-4 items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label htmlFor="resultsPerPage" className="text-sm">Results per page:</label>
            <select 
              id="resultsPerPage"
              value={resultsPerPage} 
              onChange={handleResultsPerPageChange} 
              className="border px-2 py-1 rounded text-sm"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={250}>250</option>
              <option value={500}>500</option>
            </select>
          </div>
          <div className="text-sm text-gray-600">
            Showing {startIndex + 1}-{Math.min(endIndex, totalResults)} of {totalResults} results
          </div>
        </div>
        <button onClick={exportCSV} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition">
          Export All Results ({totalResults}) as CSV
        </button>
      </div>

      {/* Pagination Controls - Top */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 mb-4">
          <button 
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage === 1}
            className="px-3 py-1 border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
          >
            Previous
          </button>
          
          {getPageNumbers().map((page, index) => (
            <button
              key={index}
              onClick={() => typeof page === 'number' ? goToPage(page) : null}
              disabled={page === '...'}
              className={`px-3 py-1 border rounded ${
                page === currentPage 
                  ? 'bg-blue-600 text-white' 
                  : page === '...' 
                    ? 'cursor-default' 
                    : 'hover:bg-gray-100'
              }`}
            >
              {page}
            </button>
          ))}
          
          <button 
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="px-3 py-1 border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
          >
            Next
          </button>
        </div>
      )}

      {/* Results Table */}
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
            {currentResults.map((slot, index) => {
              const ladder = slot.ladder.toString().padStart(2, '0');
              const shelf  = slot.shelf.toString().padStart(2, '0');
              const pos    = slot.empty_position ?? 'XXX';
              return (
                <tr 
                  key={`${slot.floor}-${slot.range}-${ladder}-${shelf}-${pos}-${startIndex + index}`} 
                  className="odd:bg-white even:bg-gray-50"
                >
                  <td className="px-4 py-1 border text-center">{slot.floor}</td>
                  <td className="px-4 py-1 border text-center">{slot.range}</td>
                  <td className="px-4 py-1 border text-center">{ladder}</td>
                  <td className="px-4 py-1 border text-center">{shelf}</td>
                  <td className="px-4 py-1 border text-center">{pos}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls - Bottom */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 mt-4">
          <button 
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage === 1}
            className="px-3 py-1 border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
          >
            Previous
          </button>
          
          {getPageNumbers().map((page, index) => (
            <button
              key={index}
              onClick={() => typeof page === 'number' ? goToPage(page) : null}
              disabled={page === '...'}
              className={`px-3 py-1 border rounded ${
                page === currentPage 
                  ? 'bg-blue-600 text-white' 
                  : page === '...' 
                    ? 'cursor-default' 
                    : 'hover:bg-gray-100'
              }`}
            >
              {page}
            </button>
          ))}
          
          <button 
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="px-3 py-1 border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
          >
            Next
          </button>
        </div>
      )}

      {/* No results message */}
      {totalResults === 0 && (
        <div className="text-center py-8 text-gray-500">
          No empty slots found matching the current filters.
        </div>
      )}
    </div>
  );
};

export default EmptySlots;