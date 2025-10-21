import React, { useState, useEffect } from 'react';
import apiFetch from '../api/client';

const ShelfOptimization = () => {
  const [activeTab, setActiveTab] = useState('shelf-analysis');
  const [loading, setLoading] = useState(false);
  const [shelfAnalysis, setShelfAnalysis] = useState(null);
  const [availableSpace, setAvailableSpace] = useState(null);
  const [consolidationOps, setConsolidationOps] = useState(null);
  const [weededAnalysis, setWeededAnalysis] = useState(null);
  const [optimalPlacement, setOptimalPlacement] = useState(null);
  const [filters, setFilters] = useState({
    floor: '',  // Default to all floors
    range: '',
    sortBy: 'fill_percentage',
    sortOrder: 'asc',
    densityFilter: '',  // empty, very_low, low, medium, high
    minConsecutiveSlots: 1,
    maxFillPercentage: 50,
    minWeededCount: 1,
    itemCount: 100,
    preferEmptyShelves: true
  });
  const [pagination, setPagination] = useState({
    limit: 250,
    offset: 0
  });

  // Export to CSV functions
  const exportToCSV = async (endpoint, filename) => {
    try {
      const token = localStorage.getItem("token");
      const params = new URLSearchParams();
      
      if (filters.floor) params.append('floor', filters.floor);
      if (filters.range) params.append('range_code', filters.range);
      
      if (endpoint === 'shelf-analysis') {
        // Density filter is required for shelf-analysis export
        if (!filters.densityFilter) {
          alert('Please select a Density Filter before exporting.');
          return;
        }
        params.append('sort_by', filters.sortBy);
        params.append('sort_order', filters.sortOrder);
        params.append('density_filter', filters.densityFilter);
      } else if (endpoint === 'available-space') {
        params.append('min_consecutive_slots', filters.minConsecutiveSlots);
      } else if (endpoint === 'consolidation') {
        params.append('max_fill_percentage', filters.maxFillPercentage);
      }
      
      const response = await apiFetch(`/shelf-optimization/export/${endpoint}?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error('Error exporting CSV:', error);
      alert('Failed to export CSV. Please try again.');
    }
  };

  const fetchShelfAnalysis = async (resetPagination = false) => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      const params = new URLSearchParams();
      
      if (filters.floor) params.append('floor', filters.floor);
      if (filters.range) params.append('range_code', filters.range);
      params.append('sort_by', filters.sortBy);
      params.append('sort_order', filters.sortOrder);
      if (filters.densityFilter) params.append('density_filter', filters.densityFilter);
      
      const currentPagination = resetPagination ? { limit: 250, offset: 0 } : pagination;
      params.append('limit', currentPagination.limit);
      params.append('offset', currentPagination.offset);
      
      if (resetPagination) {
        setPagination({ limit: 250, offset: 0 });
      }
      
      const response = await apiFetch(`/shelf-optimization/shelf-analysis?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setShelfAnalysis(data);
      }
    } catch (error) {
      console.error('Error fetching shelf analysis:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableSpace = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      const params = new URLSearchParams();
      
      if (filters.floor) params.append('floor', filters.floor);
      if (filters.range) params.append('range_code', filters.range);
      params.append('min_consecutive_slots', filters.minConsecutiveSlots);
      
      // Fetch both available space and weeded analysis
      const [availableResponse, weededResponse] = await Promise.all([
        apiFetch(`/shelf-optimization/available-space?${params}`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        apiFetch(`/shelf-optimization/weeded-space-analysis?${params}&min_weeded_count=${filters.minWeededCount}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);
      
      if (availableResponse.ok) {
        const data = await availableResponse.json();
        setAvailableSpace(data);
      }
      
      if (weededResponse.ok) {
        const data = await weededResponse.json();
        setWeededAnalysis(data);
      }
    } catch (error) {
      console.error('Error fetching available space:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchConsolidationOpportunities = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      const params = new URLSearchParams();
      
      if (filters.floor) params.append('floor', filters.floor);
      if (filters.range) params.append('range_code', filters.range);
      params.append('max_fill_percentage', filters.maxFillPercentage);
      
      const placementParams = new URLSearchParams(params);
      placementParams.append('item_count', filters.itemCount);
      placementParams.append('prefer_empty_shelves', filters.preferEmptyShelves);
      
      // Fetch both consolidation opportunities and optimal placement
      const [consolidationResponse, placementResponse] = await Promise.all([
        apiFetch(`/shelf-optimization/consolidation-opportunities?${params}`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        apiFetch(`/shelf-optimization/optimal-placement?${placementParams}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);
      
      if (consolidationResponse.ok) {
        const data = await consolidationResponse.json();
        setConsolidationOps(data);
      }
      
      if (placementResponse.ok) {
        const data = await placementResponse.json();
        setOptimalPlacement(data);
      }
    } catch (error) {
      console.error('Error fetching consolidation data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchWeededAnalysis = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      const params = new URLSearchParams();
      
      if (filters.floor) params.append('floor', filters.floor);
      if (filters.range) params.append('range_code', filters.range);
      params.append('min_weeded_count', filters.minWeededCount);
      
      const response = await apiFetch(`/shelf-optimization/weeded-space-analysis?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setWeededAnalysis(data);
      }
    } catch (error) {
      console.error('Error fetching weeded analysis:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchOptimalPlacement = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      const params = new URLSearchParams();
      
      params.append('item_count', filters.itemCount);
      params.append('prefer_empty_shelves', filters.preferEmptyShelves);
      if (filters.floor) params.append('floor', filters.floor);
      if (filters.range) params.append('range_code', filters.range);
      
      const response = await apiFetch(`/shelf-optimization/optimal-placement?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setOptimalPlacement(data);
      }
    } catch (error) {
      console.error('Error fetching optimal placement:', error);
    } finally {
      setLoading(false);
    }
  };

  // Removed auto-fetch on tab change - user must click "Apply Filters" button
  // This prevents 5-minute loading times when opening the page
  
  // useEffect(() => {
  //   if (activeTab === 'shelf-analysis') {
  //     fetchShelfAnalysis();
  //   } else if (activeTab === 'available-space') {
  //     fetchAvailableSpace();
  //   } else if (activeTab === 'consolidation') {
  //     fetchConsolidationOpportunities();
  //   }
  // }, [activeTab]);

  // Refetch when pagination changes (only for shelf-analysis)
  useEffect(() => {
    if (activeTab === 'shelf-analysis' && shelfAnalysis) {
      fetchShelfAnalysis();
    }
  }, [pagination.offset]);

  const renderFilters = () => (
    <div className="bg-white rounded-lg shadow p-4 mb-6">
      <h3 className="text-lg font-semibold mb-4">Filters</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Floor</label>
          <input
            type="text"
            value={filters.floor}
            onChange={(e) => setFilters({ ...filters, floor: e.target.value })}
            placeholder="e.g., 3, A"
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Range</label>
          <input
            type="text"
            value={filters.range}
            onChange={(e) => setFilters({ ...filters, range: e.target.value })}
            placeholder="e.g., 01A, 23B"
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
          />
        </div>
        
        {activeTab === 'shelf-analysis' && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Density Filter</label>
              <select
                value={filters.densityFilter}
                onChange={(e) => setFilters({ ...filters, densityFilter: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="">All Shelves</option>
                <option value="empty">Empty (0%)</option>
                <option value="very_low">Very Low (1-25%)</option>
                <option value="low">Low (26-50%)</option>
                <option value="medium">Medium (51-75%)</option>
                <option value="high">High (76-100%)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sort By</label>
              <select
                value={filters.sortBy}
                onChange={(e) => setFilters({ ...filters, sortBy: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="fill_percentage">Fill Percentage</option>
                <option value="weeded_count">Weeded Count</option>
                <option value="items_count">Item Count</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sort Order</label>
              <select
                value={filters.sortOrder}
                onChange={(e) => setFilters({ ...filters, sortOrder: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="asc">Ascending (Low to High)</option>
                <option value="desc">Descending (High to Low)</option>
              </select>
            </div>
          </>
        )}
        
        {activeTab === 'available-space' && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min Consecutive Slots</label>
              <input
                type="number"
                value={filters.minConsecutiveSlots}
                onChange={(e) => setFilters({ ...filters, minConsecutiveSlots: parseInt(e.target.value) })}
                min="1"
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min Weeded Items</label>
              <input
                type="number"
                value={filters.minWeededCount}
                onChange={(e) => setFilters({ ...filters, minWeededCount: parseInt(e.target.value) })}
                min="1"
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
          </>
        )}
        
        {activeTab === 'consolidation' && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Fill % for Consolidation</label>
              <input
                type="number"
                value={filters.maxFillPercentage}
                onChange={(e) => setFilters({ ...filters, maxFillPercentage: parseInt(e.target.value) })}
                min="1"
                max="100"
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Items to Place (for Optimal Placement)</label>
              <input
                type="number"
                value={filters.itemCount}
                onChange={(e) => setFilters({ ...filters, itemCount: parseInt(e.target.value) })}
                min="1"
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <input
                  type="checkbox"
                  checked={filters.preferEmptyShelves}
                  onChange={(e) => setFilters({ ...filters, preferEmptyShelves: e.target.checked })}
                  className="mr-2"
                />
                Prefer Empty Shelves
              </label>
            </div>
          </>
        )}
      </div>
      
      <div className="flex gap-2 mt-4">
        <button
          onClick={() => {
            if (activeTab === 'shelf-analysis') {
              if (!filters.densityFilter) {
                alert('Please select a Density Filter to view shelf analysis. This prevents loading thousands of shelves at once.');
                return;
              }
              fetchShelfAnalysis(true); // Reset pagination
            } else if (activeTab === 'available-space') {
              fetchAvailableSpace();
            } else if (activeTab === 'consolidation') {
              fetchConsolidationOpportunities();
            }
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Apply Filters
        </button>
        <button
          onClick={() => {
            if (activeTab === 'shelf-analysis') {
              exportToCSV('shelf-analysis', 'shelf_analysis.csv');
            } else if (activeTab === 'available-space') {
              exportToCSV('available-space', 'available_and_weeded_space.csv');
            } else if (activeTab === 'consolidation') {
              exportToCSV('consolidation', 'consolidation_opportunities.csv');
            }
          }}
          className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center gap-2"
        >
          <span>📥</span> Export to CSV
        </button>
      </div>
    </div>
  );

  const renderShelfAnalysis = () => {
    if (!shelfAnalysis) {
      return (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-8 text-center">
          <div className="text-4xl mb-4">📊</div>
          <h3 className="text-lg font-semibold text-blue-900 mb-2">Ready to Analyze Shelves</h3>
          <p className="text-blue-700 mb-4">
            Select a <strong>Density Filter</strong> above to view shelves by fill percentage.
          </p>
          <p className="text-sm text-blue-600">
            💡 Tip: Use "Empty (0%)" to find available shelves, or "Very Low" for consolidation opportunities.
          </p>
        </div>
      );
    }

    const { summary, shelves, pagination: paginationInfo } = shelfAnalysis;

    // Check if we're using density filter (single category response)
    const isDensityFiltered = Array.isArray(shelves);
    
    const categoryConfig = {
      empty: { label: 'Empty (0%)', color: 'bg-gray-100 border-gray-400 text-gray-800' },
      very_low: { label: 'Very Low (1-25%)', color: 'bg-green-100 border-green-400 text-green-800' },
      low: { label: 'Low (26-50%)', color: 'bg-yellow-100 border-yellow-400 text-yellow-800' },
      medium: { label: 'Medium (51-75%)', color: 'bg-orange-100 border-orange-400 text-orange-800' },
      high: { label: 'High (76-100%)', color: 'bg-red-100 border-red-400 text-red-800' }
    };

    const handlePrevPage = () => {
      if (pagination.offset > 0) {
        setPagination({ ...pagination, offset: Math.max(0, pagination.offset - pagination.limit) });
      }
    };

    const handleNextPage = () => {
      setPagination({ ...pagination, offset: pagination.offset + pagination.limit });
    };

    return (
      <div className="space-y-6">
        {/* Summary Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
            <div className="text-2xl font-bold text-blue-600">{summary.total_shelves}</div>
            <div className="text-sm text-gray-600">Total Shelves</div>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg shadow border border-gray-200">
            <div className="text-2xl font-bold text-gray-600">{summary.by_density.empty || 0}</div>
            <div className="text-sm text-gray-600">Empty (0%)</div>
          </div>
          <div className="bg-green-50 p-4 rounded-lg shadow border border-green-200">
            <div className="text-2xl font-bold text-green-600">{summary.by_density.very_low}</div>
            <div className="text-sm text-gray-600">Very Low (1-25%)</div>
          </div>
          <div className="bg-yellow-50 p-4 rounded-lg shadow border border-yellow-200">
            <div className="text-2xl font-bold text-yellow-600">{summary.by_density.low}</div>
            <div className="text-sm text-gray-600">Low (26-50%)</div>
          </div>
          <div className="bg-orange-50 p-4 rounded-lg shadow border border-orange-200">
            <div className="text-2xl font-bold text-orange-600">{summary.by_density.medium}</div>
            <div className="text-sm text-gray-600">Medium (51-75%)</div>
          </div>
        </div>

        {/* Filtered Results with Pagination */}
        {isDensityFiltered && (
          <>
            <div className="bg-white rounded-lg shadow">
              <div className="px-4 py-3 bg-blue-50 rounded-t-lg border-b border-blue-200">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-lg text-blue-900">
                    {filters.densityFilter ? categoryConfig[filters.densityFilter]?.label : 'All Shelves'} - 
                    Showing {paginationInfo.returned} of {paginationInfo.total_in_category}
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handlePrevPage}
                      disabled={pagination.offset === 0}
                      className="px-3 py-1 bg-white border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                    >
                      Previous
                    </button>
                    <span className="text-sm text-gray-600">
                      {pagination.offset + 1} - {Math.min(pagination.offset + pagination.limit, paginationInfo.total_in_category)} of {paginationInfo.total_in_category}
                    </span>
                    <button
                      onClick={handleNextPage}
                      disabled={pagination.offset + pagination.limit >= paginationInfo.total_in_category}
                      className="px-3 py-1 bg-white border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
              <div className="p-4">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Shelf</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Items</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Material Size</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Space Used</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Space Available</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Weeded</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fill %</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {shelves.map((shelf, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">
                            {shelf.call_number}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">{shelf.current_items}</td>
                          <td className="px-4 py-3 text-sm">
                            <div className="flex items-center space-x-1">
                              <span className="text-lg">{shelf.material_size === 'large' ? '📚' : shelf.material_size === 'average' ? '📖' : '📄'}</span>
                              <span className={`px-2 py-1 rounded text-xs font-medium ${
                                shelf.material_size === 'large' ? 'bg-purple-100 text-purple-800' :
                                shelf.material_size === 'average' ? 'bg-blue-100 text-blue-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {shelf.material_size}
                              </span>
                            </div>
                            <div className="text-xs text-gray-500 mt-1">~{shelf.estimated_item_width}" each</div>
                            <div className="text-xs text-gray-600 mt-1">
                              Can fit: {shelf.can_fit_materials?.join(', ')}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <span className="font-semibold text-gray-900">{shelf.used_space_inches}"</span>
                            <div className="text-xs text-gray-500">of 35"</div>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <span className="font-semibold text-green-700">{shelf.available_space_inches}"</span>
                            <div className="text-xs text-gray-500">empty</div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">{shelf.weeded_count}</td>
                          <td className="px-4 py-3 text-sm">
                            <div className="flex items-center">
                              <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                                <div
                                  className="bg-blue-600 h-2 rounded-full"
                                  style={{ width: `${shelf.fill_percentage}%` }}
                                ></div>
                              </div>
                              <span className="font-medium">{shelf.fill_percentage}%</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => window.location.href = `/shelf-viewer?shelf=${encodeURIComponent(shelf.call_number)}`}
                              className="text-blue-600 hover:text-blue-800 font-medium text-sm flex items-center gap-1 mx-auto"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                              View Records
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Categorized Shelves (when no density filter) */}
        {!isDensityFiltered && Object.entries(categoryConfig).map(([category, config]) => {
          const categoryData = shelves[category] || [];
          if (categoryData.length === 0) return null;

          return (
            <div key={category} className="bg-white rounded-lg shadow">
              <div className={`${config.color} px-4 py-3 rounded-t-lg border-b`}>
                <h3 className="font-semibold text-lg">
                  {config.label} - {categoryData.length} Shelves
                </h3>
              </div>
              <div className="p-4">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Shelf</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Items</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Material Size</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Space Used</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Space Available</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Weeded</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fill %</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {categoryData.map((shelf, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">
                            {shelf.call_number}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">{shelf.current_items}</td>
                          <td className="px-4 py-3 text-sm">
                            <div className="flex items-center space-x-1">
                              <span className="text-lg">{shelf.material_size === 'large' ? '📚' : shelf.material_size === 'average' ? '📖' : '📄'}</span>
                              <span className={`px-2 py-1 rounded text-xs font-medium ${
                                shelf.material_size === 'large' ? 'bg-purple-100 text-purple-800' :
                                shelf.material_size === 'average' ? 'bg-blue-100 text-blue-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {shelf.material_size}
                              </span>
                            </div>
                            <div className="text-xs text-gray-500 mt-1">~{shelf.estimated_item_width}" each</div>
                            <div className="text-xs text-gray-600 mt-1">
                              Can fit: {shelf.can_fit_materials?.join(', ')}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <span className="font-semibold text-gray-900">{shelf.used_space_inches}"</span>
                            <div className="text-xs text-gray-500">of 35"</div>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <span className="font-semibold text-green-700">{shelf.available_space_inches}"</span>
                            <div className="text-xs text-gray-500">empty</div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">{shelf.weeded_count}</td>
                          <td className="px-4 py-3 text-sm">
                            <div className="flex items-center">
                              <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                                <div
                                  className="bg-blue-600 h-2 rounded-full"
                                  style={{ width: `${shelf.fill_percentage}%` }}
                                ></div>
                              </div>
                              <span className="text-gray-700">{shelf.fill_percentage}%</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-center">
                            <a
                              href={`/shelf-viewer?shelf=${encodeURIComponent(shelf.call_number)}`}
                              className="text-purple-600 hover:text-purple-800 font-medium inline-flex items-center gap-1"
                              onClick={(e) => {
                                e.preventDefault();
                                window.location.href = `/shelf-viewer?shelf=${encodeURIComponent(shelf.call_number)}`;
                              }}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                              View
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderAvailableSpace = () => (
    <div className="space-y-4">
      {availableSpace && (
        <>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-blue-900 mb-2">Summary</h3>
            <p className="text-blue-800">
              Found <strong>{availableSpace.total_shelves_with_space}</strong> shelves with available space
            </p>
          </div>
          
          <div className="space-y-3">
            {availableSpace.spaces.map((space, idx) => (
              <div key={idx} className="bg-white border rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h4 className="font-semibold text-lg">{space.call_number_base}</h4>
                    <p className="text-sm text-gray-600">
                      Floor {space.floor}, Range {space.range_code}, Ladder {space.ladder}, Shelf {space.shelf}
                    </p>
                    {space.material_size && (
                      <div className="mt-2 flex items-center space-x-2">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          space.material_size === 'large' ? 'bg-purple-100 text-purple-800' :
                          space.material_size === 'average' ? 'bg-blue-100 text-blue-800' :
                          space.material_size === 'small' ? 'bg-gray-100 text-gray-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {space.material_size === 'empty' ? '✅ Empty - Any Size' : `📚 ${space.material_size} materials`}
                        </span>
                        {space.current_items !== undefined && (
                          <span className="text-xs text-gray-600">
                            Current: {space.current_items} items
                          </span>
                        )}
                      </div>
                    )}
                    {space.material_description && (
                      <p className="text-xs text-gray-500 mt-1">{space.material_description}</p>
                    )}
                    {space.can_fit_materials && (
                      <p className="text-xs text-green-600 mt-1">
                        Can fit: {space.can_fit_materials.join(', ')} materials
                      </p>
                    )}
                  </div>
                  {space.is_completely_empty ? (
                    <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                      Completely Empty
                    </span>
                  ) : (
                    <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm font-medium">
                      {space.total_available} Slots Available
                    </span>
                  )}
                </div>
                
                {!space.is_completely_empty && space.empty_positions && space.empty_positions.length > 0 && (
                  <div className="mt-2">
                    <p className="text-sm text-gray-600 mb-1">Empty positions:</p>
                    <div className="flex flex-wrap gap-1">
                      {space.empty_positions.slice(0, 10).map((pos, i) => (
                        <span key={i} className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">
                          {pos}
                        </span>
                      ))}
                      {space.empty_positions.length > 10 && (
                        <span className="px-2 py-1 text-gray-500 text-xs">
                          +{space.empty_positions.length - 10} more
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );

  const renderConsolidation = () => (
    <div className="space-y-4">
      {consolidationOps && (
        <>
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-purple-900 mb-2">Summary</h3>
            <p className="text-purple-800">
              Found <strong>{consolidationOps.total_opportunities}</strong> consolidation opportunities
            </p>
          </div>
          
          <div className="space-y-4">
            {consolidationOps.opportunities.map((opp, idx) => (
              <div key={idx} className="bg-white border rounded-lg p-4">
                <div className="mb-3">
                  <h4 className="font-semibold text-lg">Floor {opp.floor}, Range {opp.range_code}</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
                    <div className="bg-blue-50 p-2 rounded">
                      <p className="text-xs text-gray-600">Partial Shelves</p>
                      <p className="text-lg font-semibold text-blue-900">{opp.current_partial_shelves}</p>
                    </div>
                    <div className="bg-green-50 p-2 rounded">
                      <p className="text-xs text-gray-600">Can Consolidate To</p>
                      <p className="text-lg font-semibold text-green-900">{opp.shelves_needed_after_consolidation}</p>
                    </div>
                    <div className="bg-orange-50 p-2 rounded">
                      <p className="text-xs text-gray-600">Shelves Freed</p>
                      <p className="text-lg font-semibold text-orange-900">{opp.shelves_freed}</p>
                    </div>
                    <div className="bg-purple-50 p-2 rounded">
                      <p className="text-xs text-gray-600">Total Items</p>
                      <p className="text-lg font-semibold text-purple-900">{opp.total_items}</p>
                    </div>
                  </div>
                </div>
                
                <div>
                  <h5 className="text-sm font-semibold text-gray-700 mb-2">Shelves to Consolidate:</h5>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {opp.shelves.map((shelf, i) => (
                      <div key={i} className="bg-gray-50 p-2 rounded text-sm">
                        <p className="font-medium">{shelf.call_number}</p>
                        <p className="text-gray-600">
                          {shelf.current_items} items ({shelf.fill_percentage}% full) 
                          - {shelf.available_space} spaces available
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );

  const renderWeededAnalysis = () => (
    <div className="space-y-4">
      {weededAnalysis && (
        <>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-red-900 mb-2">Weeding Summary</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-red-700">Total Items Weeded</p>
                <p className="text-2xl font-bold text-red-900">{weededAnalysis.total_items_weeded || 0}</p>
              </div>
              <div>
                <p className="text-sm text-red-700">Shelves Affected</p>
                <p className="text-2xl font-bold text-red-900">{weededAnalysis.total_locations || 0}</p>
              </div>
            </div>
          </div>
          
          <div className="space-y-3">
            {weededAnalysis.shelves && weededAnalysis.shelves.map((shelf, idx) => (
              <div key={idx} className="bg-white border rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-semibold text-lg">{shelf.call_number}</h4>
                    <p className="text-sm text-gray-600">
                      Floor {shelf.floor}, Range {shelf.range_code}, Ladder {shelf.ladder}, Shelf {shelf.shelf}
                    </p>
                    <p className="text-sm text-gray-700 mt-2">
                      <strong>{shelf.weeded_count}</strong> items weeded
                      {shelf.current_items !== undefined && (
                        <span className="ml-2 text-gray-600">
                          | Current: <strong>{shelf.current_items}</strong> items
                        </span>
                      )}
                    </p>
                    <div className="mt-2 flex items-center space-x-2">
                      {shelf.weeded_material_size && (
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          shelf.weeded_material_size === 'large' ? 'bg-purple-100 text-purple-800' :
                          shelf.weeded_material_size === 'average' ? 'bg-blue-100 text-blue-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          Weeded: {shelf.weeded_material_size}
                        </span>
                      )}
                      {shelf.current_material_size && (
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          shelf.current_material_size === 'empty' ? 'bg-green-100 text-green-800' :
                          shelf.current_material_size === 'large' ? 'bg-purple-100 text-purple-800' :
                          shelf.current_material_size === 'average' ? 'bg-blue-100 text-blue-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          Now: {shelf.current_material_size}
                        </span>
                      )}
                    </div>
                    {shelf.can_fit_materials && (
                      <p className="text-xs text-green-600 mt-1">
                        Can now fit: {shelf.can_fit_materials.join(', ')} materials
                      </p>
                    )}
                    {shelf.last_weeded && (
                      <p className="text-xs text-gray-500 mt-1">
                        Last weeded: {new Date(shelf.last_weeded).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  {shelf.shelf_now_empty ? (
                    <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                      Now Empty
                    </span>
                  ) : (
                    <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm font-medium">
                      Partial Space
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );

  const renderOptimalPlacement = () => (
    <div className="space-y-4">
      {optimalPlacement && (
        <>
          <div className={`border rounded-lg p-4 ${
            optimalPlacement.can_accommodate_all 
              ? 'bg-green-50 border-green-200' 
              : 'bg-yellow-50 border-yellow-200'
          }`}>
            <h3 className="text-lg font-semibold mb-2">Placement Summary</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-gray-700">Requested Items</p>
                <p className="text-2xl font-bold">{optimalPlacement.requested_items}</p>
              </div>
              <div>
                <p className="text-sm text-gray-700">Can Place</p>
                <p className="text-2xl font-bold text-green-700">{optimalPlacement.items_placed}</p>
              </div>
              <div>
                <p className="text-sm text-gray-700">Remaining</p>
                <p className="text-2xl font-bold text-orange-700">{optimalPlacement.items_remaining}</p>
              </div>
            </div>
            {!optimalPlacement.can_accommodate_all && (
              <p className="mt-2 text-sm text-yellow-800">
                ⚠️ Not enough space for all items. Consider consolidation or different filters.
              </p>
            )}
          </div>
          
          <div className="space-y-3">
            <h3 className="text-lg font-semibold">Recommended Locations</h3>
            {optimalPlacement.recommendations.map((rec, idx) => (
              <div key={idx} className="bg-white border rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h4 className="font-semibold text-lg">{rec.location}</h4>
                    <p className="text-sm text-gray-600">
                      Floor {rec.floor}, Range {rec.range_code}, Ladder {rec.ladder}, Shelf {rec.shelf}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600">Place here:</p>
                    <p className="text-2xl font-bold text-blue-600">{rec.items_to_place} items</p>
                  </div>
                </div>
                
                <div className="mt-3">
                  {rec.type === 'empty_shelf' ? (
                    <div className="bg-green-50 p-2 rounded">
                      <p className="text-sm text-green-800">
                        <strong>Empty Shelf</strong> - Suggested positions: {rec.suggested_positions.slice(0, 10).join(', ')}
                        {rec.suggested_positions.length > 10 && '...'}
                      </p>
                    </div>
                  ) : (
                    <div className="bg-blue-50 p-2 rounded">
                      <p className="text-sm text-blue-800">
                        <strong>Partial Shelf</strong> - Use positions: {rec.available_positions.join(', ')}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );

  // Combined render functions for the 3-tab layout
  const renderAvailableAndWeededSpace = () => (
    <div className="space-y-8">
      {/* Available Space Section */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-4">📦 Available Space</h2>
        {renderAvailableSpace()}
      </div>
      
      {/* Weeded Analysis Section */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-4">🗑️ Weeded Space Analysis</h2>
        {renderWeededAnalysis()}
      </div>
    </div>
  );

  const renderConsolidationAndPlacement = () => (
    <div className="space-y-8">
      {/* Consolidation Opportunities Section */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-4">🔄 Consolidation Opportunities</h2>
        {renderConsolidation()}
      </div>
      
      {/* Optimal Placement Section */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-4">🎯 Optimal Placement Recommendations</h2>
        {renderOptimalPlacement()}
      </div>
    </div>
  );

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Shelf Optimization</h1>
        <p className="text-gray-600 mt-2">
          Find available space, consolidate shelves, and optimize placement for new items
        </p>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow mb-6">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            {[
              { id: 'shelf-analysis', label: '📊 Shelf Analysis', description: 'View shelf utilization by fill percentage' },
              { id: 'available-space', label: '📦 Available & Weeded Space', description: 'Find empty slots and recently weeded shelves' },
              { id: 'consolidation', label: '🔄 Consolidation & Placement', description: 'Consolidate shelves and find optimal placement' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors flex-1 ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600 bg-blue-50'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                }`}
                title={tab.description}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Filters */}
      {renderFilters()}

      {/* Content */}
      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading data...</p>
        </div>
      ) : (
        <div>
          {activeTab === 'shelf-analysis' && renderShelfAnalysis()}
          {activeTab === 'available-space' && renderAvailableAndWeededSpace()}
          {activeTab === 'consolidation' && renderConsolidationAndPlacement()}
        </div>
      )}
    </div>
  );
};

export default ShelfOptimization;
