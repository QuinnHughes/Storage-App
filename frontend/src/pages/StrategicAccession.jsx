import React, { useState, useEffect } from 'react';
import apiFetch from '../api/client';

const StrategicAccession = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(false);
  const [densityData, setDensityData] = useState(null);
  const [bulkZones, setBulkZones] = useState(null);
  const [consolidationPlans, setConsolidationPlans] = useState(null);
  const [rangeAnalysis, setRangeAnalysis] = useState(null);
  const [positionMapping, setPositionMapping] = useState(null);
  const [gapAnalysis, setGapAnalysis] = useState(null);
  const [availableSpaceSummary, setAvailableSpaceSummary] = useState(null);
  const [weededConsolidation, setWeededConsolidation] = useState(null);
  const [filters, setFilters] = useState({
    sizeCategory: '',
    floor: '',
    range: '',
    minConsecutiveShelves: 5,
    minGapSize: 3,
    minWeededItems: 2,
    itemCount: 100,
    preferConsolidation: true
  });

  const fetchPositionMapping = async () => {
    try {
      const token = localStorage.getItem("token");
      const params = new URLSearchParams();
      
      if (filters.sizeCategory) params.append('size_category', filters.sizeCategory);
      if (filters.floor) params.append('floor', filters.floor);
      if (filters.range) params.append('range_code', filters.range);
      
      const response = await apiFetch(`/strategic-accession/position-mapping?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setPositionMapping(data);
      }
    } catch (error) {
      console.error('Error fetching position mapping:', error);
    }
  };

  const fetchGapAnalysis = async () => {
    try {
      const token = localStorage.getItem("token");
      const params = new URLSearchParams({
        min_gap_size: filters.minGapSize.toString()
      });
      
      if (filters.floor) params.append('floor', filters.floor);
      if (filters.range) params.append('range_code', filters.range);
      
      const response = await apiFetch(`/strategic-accession/gap-analysis?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setGapAnalysis(data);
      }
    } catch (error) {
      console.error('Error fetching gap analysis:', error);
    }
  };

  const fetchAvailableSpaceSummary = async () => {
    try {
      const token = localStorage.getItem("token");
      const params = new URLSearchParams();
      
      if (filters.sizeCategory) params.append('size_category', filters.sizeCategory);
      if (filters.floor) params.append('floor', filters.floor);
      
      const response = await apiFetch(`/strategic-accession/available-space-summary?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setAvailableSpaceSummary(data);
      }
    } catch (error) {
      console.error('Error fetching available space summary:', error);
    }
  };

  const fetchWeededConsolidation = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      const params = new URLSearchParams({
        min_weeded_items: filters.minWeededItems.toString()
      });
      
      if (filters.sizeCategory) params.append('size_category', filters.sizeCategory);
      if (filters.floor) params.append('floor', filters.floor);
      
      const response = await apiFetch(`/strategic-accession/weeded-consolidation-opportunities?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setWeededConsolidation(data);
      }
    } catch (error) {
      console.error('Error fetching weeded consolidation opportunities:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchDensityAnalysis = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      const params = new URLSearchParams();
      
      if (filters.sizeCategory) params.append('size_category', filters.sizeCategory);
      if (filters.floor) params.append('floor', filters.floor);
      
      const response = await apiFetch(`/strategic-accession/shelf-density-analysis?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setDensityData(data);
      }
    } catch (error) {
      console.error('Error fetching density analysis:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchBulkZones = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      const params = new URLSearchParams({
        min_consecutive_shelves: filters.minConsecutiveShelves.toString()
      });
      
      if (filters.sizeCategory) params.append('size_category', filters.sizeCategory);
      
      const response = await apiFetch(`/strategic-accession/bulk-placement-zones?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setBulkZones(data);
      }
    } catch (error) {
      console.error('Error fetching bulk zones:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchConsolidationPlans = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      const params = new URLSearchParams();
      
      if (filters.range) params.append('range_filter', filters.range);
      if (filters.sizeCategory) params.append('size_category', filters.sizeCategory);
      
      const response = await apiFetch(`/strategic-accession/consolidation-plan?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setConsolidationPlans(data);
      }
    } catch (error) {
      console.error('Error fetching consolidation plans:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAvailableSpaceSummary();
    
    if (activeTab === 'overview') {
      fetchDensityAnalysis();
      fetchPositionMapping();
    } else if (activeTab === 'position-mapping') {
      fetchPositionMapping();
      fetchGapAnalysis();
    } else if (activeTab === 'weeded-consolidation') {
      fetchWeededConsolidation();
    } else if (activeTab === 'analytics') {
      fetchDensityAnalysis();
    } else if (activeTab === 'placement') {
      fetchBulkZones();
    } else if (activeTab === 'consolidation') {
      fetchConsolidationPlans();
    }
  }, [activeTab, filters.sizeCategory, filters.floor, filters.range, filters.minConsecutiveShelves, filters.minGapSize, filters.minWeededItems]);

  const PositionMap = ({ shelf }) => {
    const renderPosition = (pos, index) => {
      const getColor = () => {
        switch (pos.status) {
          case 'A': return 'bg-green-500 text-white'; // Active item
          case 'W': return 'bg-red-400 text-white';   // Weeded item  
          case 'E': return 'bg-gray-200 text-gray-600';  // Empty position
          default: return 'bg-gray-300';
        }
      };
      
      return (
        <div
          key={index}
          className={`w-8 h-8 rounded ${getColor()} border border-gray-300 flex items-center justify-center text-xs font-bold cursor-pointer hover:scale-110 transition-transform`}
          title={`Position ${pos.position}: ${
            pos.status === 'A' ? 'Active Item' :
            pos.status === 'W' ? 'Weeded Item (Available)' : 'Empty'
          }`}
        >
          {pos.position <= 99 ? pos.position : '99+'}
        </div>
      );
    };

    return (
      <div className="bg-white border rounded-lg p-4 space-y-3">
        <div className="flex justify-between items-center">
          <span className="font-mono text-sm font-bold">{shelf.call_number_base}</span>
          <div className="flex space-x-3 text-xs">
            <span className="flex items-center">
              <div className="w-3 h-3 bg-green-500 rounded mr-1"></div>Active ({shelf.active_items})
            </span>
            <span className="flex items-center">
              <div className="w-3 h-3 bg-red-400 rounded mr-1"></div>Weeded ({shelf.weeded_items})
            </span>
            <span className="flex items-center">
              <div className="w-3 h-3 bg-gray-200 rounded mr-1"></div>Empty ({shelf.total_gap_positions})
            </span>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-1 p-3 bg-gray-50 rounded">
          {shelf.position_map?.slice(0, 50).map((pos, index) => renderPosition(pos, index))}
          {shelf.position_map?.length > 50 && (
            <div className="text-xs text-gray-500 ml-2">
              ... and {shelf.position_map.length - 50} more positions
            </div>
          )}
        </div>
        
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div>
            <div className="text-gray-600">Fill: <span className="font-bold text-blue-600">{shelf.active_fill_percent}%</span></div>
            <div className="text-gray-600">Range: {shelf.min_position}-{shelf.max_position}</div>
          </div>
          <div>
            <div className="text-gray-600">Gaps: <span className="font-bold text-orange-600">{shelf.gaps?.length || 0}</span></div>
            <div className="text-gray-600">Largest Gap: <span className="font-bold text-red-600">{shelf.largest_gap}</span></div>
          </div>
        </div>

        {shelf.gaps && shelf.gaps.length > 0 && (
          <div className="border-t pt-2">
            <div className="text-xs font-semibold text-gray-700 mb-1">Gaps Found:</div>
            <div className="flex flex-wrap gap-1">
              {shelf.gaps.map((gap, index) => (
                <span key={index} className="px-2 py-1 bg-orange-100 text-orange-800 rounded text-xs">
                  {gap.start_position}-{gap.end_position} ({gap.gap_size})
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderOverview = () => (
    <div className="space-y-6">
      {/* Available Space Summary */}
      {availableSpaceSummary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-lg p-6 text-white">
            <div className="text-3xl font-bold">{availableSpaceSummary.grand_totals.empty_shelves}</div>
            <div className="text-green-100">Empty Shelves</div>
            <div className="text-xs text-green-200 mt-1">
              ~{availableSpaceSummary.grand_totals.empty_shelves * 20} positions
            </div>
          </div>
          <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg p-6 text-white">
            <div className="text-3xl font-bold">{availableSpaceSummary.grand_totals.empty_slots}</div>
            <div className="text-blue-100">Available Slots</div>
            <div className="text-xs text-blue-200 mt-1">From weeded items</div>
          </div>
          <div className="bg-gradient-to-r from-purple-500 to-purple-600 rounded-lg p-6 text-white">
            <div className="text-3xl font-bold">{availableSpaceSummary.grand_totals.total_available_positions.toLocaleString()}</div>
            <div className="text-purple-100">Total Capacity</div>
            <div className="text-xs text-purple-200 mt-1">Available positions</div>
          </div>
        </div>
      )}

      {/* Position Mapping Preview */}
      {positionMapping && (
        <div className="bg-white rounded-lg border p-6">
          <h3 className="text-lg font-semibold mb-4">📍 Position Mapping Preview</h3>
          <div className="grid grid-cols-1 gap-4">
            {positionMapping.consolidation_targets?.slice(0, 3).map((target, index) => (
              <PositionMap key={index} shelf={target.shelf} />
            ))}
          </div>
          {positionMapping.consolidation_targets?.length > 3 && (
            <div className="text-center mt-4">
              <button 
                onClick={() => setActiveTab('position-mapping')}
                className="text-blue-600 hover:text-blue-800 font-medium"
              >
                View all {positionMapping.consolidation_targets.length} consolidation targets →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );

  const renderPositionMapping = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold">🗺️ Position Mapping & Gap Analysis</h2>
          <p className="text-gray-600 mt-2">
            Precise position-by-position mapping showing exact occupancy, gaps, and consolidation opportunities.
          </p>
        </div>

        {/* Filters */}
        <div className="p-6 border-b border-gray-200 bg-gray-50">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Floor</label>
              <select
                value={filters.floor}
                onChange={(e) => setFilters(prev => ({ ...prev, floor: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              >
                <option value="">All Floors</option>
                <option value="1">Floor 1</option>
                <option value="2">Floor 2</option>
                <option value="A">Floor A</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Range</label>
              <input
                type="text"
                value={filters.range}
                onChange={(e) => setFilters(prev => ({ ...prev, range: e.target.value }))}
                placeholder="e.g., 23B"
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Size Category</label>
              <select
                value={filters.sizeCategory}
                onChange={(e) => setFilters(prev => ({ ...prev, sizeCategory: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              >
                <option value="">All Categories</option>
                <option value="standard">Standard</option>
                <option value="oversize">Oversize</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min Gap Size</label>
              <input
                type="number"
                value={filters.minGapSize}
                onChange={(e) => setFilters(prev => ({ ...prev, minGapSize: parseInt(e.target.value) || 3 }))}
                min="1"
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              />
            </div>
          </div>
        </div>

        {/* Available Space Position Mapping Results */}
        <div className="p-6">
          {positionMapping && (
            <>
              <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h3 className="text-lg font-semibold text-blue-800 mb-2">📍 Available Space Mapping</h3>
                <p className="text-blue-700 text-sm">
                  This shows where items <strong>CAN BE PLACED</strong> - weeded positions and empty gaps are available for new items.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
                <div className="bg-blue-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-blue-600">{positionMapping.summary.total_shelves_mapped}</div>
                  <div className="text-sm text-blue-700">Shelves Analyzed</div>
                </div>
                <div className="bg-red-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-red-600">{positionMapping.hotspot_analysis?.weeding_hotspots || 0}</div>
                  <div className="text-sm text-red-700">🔥 Weeding Hotspots</div>
                </div>
                <div className="bg-orange-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-orange-600">{positionMapping.summary.total_weeded_positions}</div>
                  <div className="text-sm text-orange-700">Available from Weeding</div>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-green-600">{positionMapping.summary.total_gap_positions || 0}</div>
                  <div className="text-sm text-green-700">Available from Gaps</div>
                </div>
                <div className="bg-purple-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-purple-600">{positionMapping.hotspot_analysis?.average_utilization || 0}%</div>
                  <div className="text-sm text-purple-700">Avg. Utilization</div>
                </div>
              </div>

              <div className="space-y-4">
                {positionMapping.consolidation_targets?.map((target, index) => (
                  <div key={index} className="border rounded-lg p-4">
                    <div className="flex justify-between items-center mb-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-semibold">
                            {target.hotspot_type === 'weeding_hotspot' ? '🔥 ' : 
                             target.hotspot_type === 'high_weeding_density' ? '⚡ ' : 
                             target.consolidation_grade === 'prime_hotspot' ? '🎯 ' : '📍 '}
                            Available Space Target #{index + 1}
                          </h4>
                          <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded-full">
                            {target.consolidation_grade?.replace('_', ' ').toUpperCase()}
                          </span>
                        </div>
                        <div className="text-right text-xs text-gray-600">
                          <div>Strategic Score: <strong>{target.strategic_score}</strong></div>
                          <div>Capacity: {target.shelf_capacity} items</div>
                        </div>
                      </div>
                      <div className="flex space-x-4 text-sm mt-2">
                        <span>Available Positions: <strong className="text-green-600">{target.consolidation_value}</strong></span>
                        <span>From Weeded Items: <strong className="text-orange-600">{target.weeded_positions_available}</strong></span>
                        <span>From Gaps: <strong className="text-blue-600">{target.gap_positions_available || 0}</strong></span>
                        <span>Can Accept: <strong className="text-purple-600">{target.consolidation_potential}</strong> items</span>
                      </div>
                    </div>
                    <PositionMap shelf={target.shelf} />
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Gap Analysis Results */}
          {gapAnalysis && (
            <div className="mt-8 border-t pt-6">
              <h3 className="text-lg font-semibold mb-4">🎯 Gap Analysis Results</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-purple-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-purple-600">{gapAnalysis.summary.total_gaps_found}</div>
                  <div className="text-sm text-purple-700">Gaps Found</div>
                </div>
                <div className="bg-blue-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-blue-600">{gapAnalysis.summary.total_available_gap_positions}</div>
                  <div className="text-sm text-blue-700">Gap Positions</div>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-green-600">{gapAnalysis.summary.high_impact_matches}</div>
                  <div className="text-sm text-green-700">High Impact Matches</div>
                </div>
              </div>

              {gapAnalysis.consolidation_matches?.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-3">Top Consolidation Matches</h4>
                  <div className="space-y-3">
                    {gapAnalysis.consolidation_matches.slice(0, 5).map((match, index) => (
                      <div key={index} className="bg-gray-50 rounded-lg p-4">
                        <div className="flex justify-between items-center">
                          <div>
                            <div className="font-medium">
                              Gap: {match.target_gap.shelf_location} (Positions {match.target_gap.gap_start}-{match.target_gap.gap_end})
                            </div>
                            <div className="text-sm text-gray-600">
                              Source: {match.source_shelf.shelf_location} ({match.source_shelf.moveable_items} moveable items)
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold text-green-600">{match.efficiency_gain}%</div>
                            <div className="text-xs text-gray-600">Efficiency Gain</div>
                          </div>
                        </div>
                        <div className="mt-2 flex justify-between text-sm">
                          <span>Items to Move: <strong>{match.items_to_move}</strong></span>
                          <span>Move Distance: <strong>{match.move_distance}</strong></span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderWeededConsolidation = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold">♻️ Weeded Item Consolidation Opportunities</h2>
          <p className="text-gray-600 mt-2">
            Prime consolidation targets based on weeded item positions - immediate space available for new items.
          </p>
        </div>

        {/* Filters */}
        <div className="p-6 border-b border-gray-200 bg-gray-50">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Floor</label>
              <select
                value={filters.floor}
                onChange={(e) => setFilters(prev => ({ ...prev, floor: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              >
                <option value="">All Floors</option>
                <option value="1">Floor 1</option>
                <option value="2">Floor 2</option>
                <option value="A">Floor A</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Size Category</label>
              <select
                value={filters.sizeCategory}
                onChange={(e) => setFilters(prev => ({ ...prev, sizeCategory: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              >
                <option value="">All Categories</option>
                <option value="standard">Standard</option>
                <option value="oversize">Oversize</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min Weeded Items</label>
              <input
                type="number"
                value={filters.minWeededItems}
                onChange={(e) => setFilters(prev => ({ ...prev, minWeededItems: parseInt(e.target.value) || 2 }))}
                min="1"
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              />
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="p-6">
          {weededConsolidation && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
                <div className="bg-green-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-green-600">{weededConsolidation.summary.total_opportunities_found}</div>
                  <div className="text-sm text-green-700">Opportunities Found</div>
                </div>
                <div className="bg-blue-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-blue-600">{weededConsolidation.summary.total_weeded_positions_available}</div>
                  <div className="text-sm text-blue-700">Weeded Positions</div>
                </div>
                <div className="bg-purple-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-purple-600">{weededConsolidation.summary.prime_targets}</div>
                  <div className="text-sm text-purple-700">Prime Targets</div>
                </div>
                <div className="bg-orange-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-orange-600">{weededConsolidation.summary.total_net_consolidation_potential}</div>
                  <div className="text-sm text-orange-700">Net Potential</div>
                </div>
                <div className="bg-red-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-red-600">
                    {(weededConsolidation.summary.hotspot_analysis?.prime_hotspots || 0) + 
                     (weededConsolidation.summary.hotspot_analysis?.weeding_hotspots || 0)}
                  </div>
                  <div className="text-sm text-red-700">🔥 Consolidation Hotspots</div>
                </div>
              </div>

              {/* Hotspot Analysis Section */}
              {weededConsolidation.summary.hotspot_analysis && (
                <div className="bg-gray-50 rounded-lg p-4 mb-6">
                  <h4 className="font-semibold mb-3">Hotspot Analysis</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <div className="font-medium text-red-600">🎯 Prime Hotspots</div>
                      <div className="text-lg">{weededConsolidation.summary.hotspot_analysis.prime_hotspots}</div>
                    </div>
                    <div>
                      <div className="font-medium text-orange-600">🔥 Weeding Hotspots</div>
                      <div className="text-lg">{weededConsolidation.summary.hotspot_analysis.weeding_hotspots}</div>
                    </div>
                    <div>
                      <div className="font-medium text-blue-600">📊 Total Capacity</div>
                      <div className="text-lg">{weededConsolidation.summary.hotspot_analysis.total_estimated_capacity}</div>
                    </div>
                    <div>
                      <div className="font-medium text-purple-600">📈 Avg Utilization</div>
                      <div className="text-lg">{weededConsolidation.summary.hotspot_analysis.average_utilization}%</div>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                {weededConsolidation.consolidation_opportunities?.map((opportunity, index) => (
                  <div key={index} className="border rounded-lg p-6 bg-gray-50">
                    <div className="flex justify-between items-center mb-4">
                      <div>
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                          {/* Hotspot icon based on type */}
                          {opportunity.hotspot_type === 'prime_hotspot' ? '🎯' : 
                           opportunity.hotspot_type === 'weeding_hotspot' ? '🔥' : 
                           opportunity.hotspot_type === 'gap_hotspot' ? '🚀' : 
                           opportunity.hotspot_type === 'excellent_target' ? '⭐' : 
                           opportunity.hotspot_type === 'high_weeding_density' ? '⚡' : '📍'}
                          {opportunity.shelf_location}
                        </h3>
                        <div className="text-sm text-gray-600">
                          {opportunity.size_category} • Floor {opportunity.floor} • Range {opportunity.range_code}
                        </div>
                        <div className="text-xs text-purple-600 font-medium">
                          {opportunity.hotspot_type?.replace(/_/g, ' ').toUpperCase()} | Strategic Score: {opportunity.strategic_score}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-green-600">{opportunity.priority_score}</div>
                        <div className="text-xs text-gray-600">Priority Score</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                      <div className="bg-red-100 rounded p-3">
                        <div className="text-lg font-bold text-red-700">{opportunity.total_weeded_positions}</div>
                        <div className="text-sm text-red-600">Weeded Positions Available</div>
                      </div>
                      <div className="bg-blue-100 rounded p-3">
                        <div className="text-lg font-bold text-blue-700">{opportunity.total_active_items}</div>
                        <div className="text-sm text-blue-600">Current Active Items</div>
                      </div>
                      <div className="bg-green-100 rounded p-3">
                        <div className="text-lg font-bold text-green-700">{opportunity.consolidation_recommendation.net_consolidation_potential}</div>
                        <div className="text-sm text-green-600">Net Consolidation Potential</div>
                      </div>
                    </div>

                    {/* Capacity Analysis */}
                    {opportunity.capacity_analysis && (
                      <div className="bg-gray-50 rounded-lg p-4 mb-4">
                        <h5 className="font-medium text-sm text-gray-700 mb-2">📊 Shelf Capacity Analysis</h5>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                          <div>
                            <div className="text-xs text-gray-500">Estimated Capacity</div>
                            <div className="font-semibold">{opportunity.capacity_analysis.estimated_shelf_capacity}</div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-500">Current Utilization</div>
                            <div className="font-semibold">{opportunity.capacity_analysis.current_utilization}%</div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-500">Weeding Density</div>
                            <div className="font-semibold text-red-600">{opportunity.capacity_analysis.weeding_density}%</div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-500">Available Capacity</div>
                            <div className="font-semibold text-green-600">{opportunity.capacity_analysis.available_capacity}</div>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="border-t pt-4">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-medium">Consolidation Priority:</span>
                        <span className={`px-3 py-1 rounded-full text-sm ${
                          opportunity.consolidation_recommendation.consolidation_priority === 'prime_hotspot' ? 'bg-red-100 text-red-800' :
                          opportunity.consolidation_recommendation.consolidation_priority === 'gap_hotspot' ? 'bg-purple-100 text-purple-800' :
                          opportunity.consolidation_recommendation.consolidation_priority === 'weeding_hotspot' ? 'bg-orange-100 text-orange-800' :
                          opportunity.consolidation_recommendation.consolidation_priority === 'excellent_target' ? 'bg-green-100 text-green-800' :
                          'bg-blue-100 text-blue-800'
                        }`}>
                          {opportunity.consolidation_recommendation.consolidation_priority?.replace(/_/g, ' ').toUpperCase()}
                        </span>
                      </div>
                      
                      <div className="text-sm text-gray-600 mb-2">
                        <strong>Weeded Positions:</strong> {opportunity.weeded_positions?.join(', ') || 'None'}
                      </div>
                      
                      {opportunity.active_positions?.length > 0 && (
                        <div className="text-sm text-gray-600 mb-2">
                          <strong>Active Positions:</strong> {opportunity.active_positions.join(', ')}
                        </div>
                      )}

                      <div className={`mt-3 p-3 rounded ${
                        opportunity.consolidation_recommendation.action === 'prime_target' 
                          ? 'bg-green-50 border-l-4 border-green-500' 
                          : 'bg-blue-50 border-l-4 border-blue-500'
                      }`}>
                        <div className="font-medium text-sm">
                          {opportunity.consolidation_recommendation.action === 'prime_target' 
                            ? '🎯 PRIME CONSOLIDATION TARGET' 
                            : '✅ GOOD CONSOLIDATION TARGET'}
                        </div>
                        <div className="text-xs text-gray-600 mt-1">
                          Can accept up to {opportunity.consolidation_recommendation.can_accept_items} items immediately
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );

  const renderShelfAnalytics = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold">📊 Shelf Density Analytics</h2>
          <p className="text-gray-600 mt-2">
            Comprehensive analysis of shelf utilization and consolidation opportunities by density.
          </p>
        </div>

        <div className="p-6">
          {densityData && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-blue-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-blue-600">{densityData.summary?.total_shelves_analyzed || 0}</div>
                  <div className="text-sm text-blue-700">Shelves Analyzed</div>
                </div>
                <div className="bg-orange-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-orange-600">{densityData.summary?.low_density_shelves || 0}</div>
                  <div className="text-sm text-orange-700">Low Density Shelves</div>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-green-600">{densityData.summary?.consolidation_opportunities_count || 0}</div>
                  <div className="text-sm text-green-700">Consolidation Opportunities</div>
                </div>
              </div>

              {/* Standard Category */}
              {densityData.shelves_by_category?.standard && (
                <div className="mb-8">
                  <h3 className="text-lg font-semibold mb-4">📚 Standard Size Items</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {Object.entries(densityData.shelves_by_category.standard).map(([density, shelves]) => (
                      <div key={density} className="bg-gray-50 rounded-lg p-4">
                        <div className="text-lg font-bold text-gray-800 capitalize">{density.replace('_', ' ')} Density</div>
                        <div className="text-2xl font-bold text-indigo-600">{shelves.length}</div>
                        <div className="text-sm text-gray-600">shelves</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Oversize Category */}
              {densityData.shelves_by_category?.oversize && (
                <div className="mb-8">
                  <h3 className="text-lg font-semibold mb-4">📦 Oversize Items</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {Object.entries(densityData.shelves_by_category.oversize).map(([density, shelves]) => (
                      <div key={density} className="bg-gray-50 rounded-lg p-4">
                        <div className="text-lg font-bold text-gray-800 capitalize">{density.replace('_', ' ')} Density</div>
                        <div className="text-2xl font-bold text-purple-600">{shelves.length}</div>
                        <div className="text-sm text-gray-600">shelves</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Consolidation Opportunities */}
              {densityData.consolidation_opportunities?.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-4">🎯 Top Consolidation Opportunities</h3>
                  <div className="space-y-3">
                    {densityData.consolidation_opportunities.slice(0, 5).map((opportunity, index) => (
                      <div key={index} className="border rounded-lg p-4 bg-yellow-50">
                        <div className="flex justify-between items-center">
                          <div>
                            <div className="font-medium">Range: {opportunity.range}</div>
                            <div className="text-sm text-gray-600">
                              {opportunity.shelves_involved} shelves • {opportunity.total_items} items
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold text-green-600">{opportunity.efficiency_gain}%</div>
                            <div className="text-xs text-gray-600">Efficiency Gain</div>
                          </div>
                        </div>
                        <div className="mt-2 text-sm">
                          <span className="text-blue-600">Can free {opportunity.shelves_freed} shelves</span>
                          <span className="mx-2">•</span>
                          <span className="text-orange-600">Move {opportunity.items_to_move} items</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
          
          {!densityData && (
            <div className="text-center py-8 text-gray-500">
              No shelf analytics data available. Try adjusting your filters.
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderBasicTab = (title, icon, data) => (
    <div className="bg-white rounded-lg border p-6">
      <h2 className="text-xl font-semibold mb-4">{icon} {title}</h2>
      <div className="text-center py-8 text-gray-500">
        {data ? 'Data loaded successfully!' : 'Loading...'}
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Strategic Accessioning</h1>
        <p className="text-xl text-gray-600 max-w-4xl mx-auto">
          Optimize storage efficiency through intelligent shelf consolidation and strategic placement planning
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8" aria-label="Tabs">
          {[
            { id: 'overview', name: 'Overview', icon: '🏠' },
            { id: 'position-mapping', name: 'Position Mapping', icon: '🗺️' },
            { id: 'weeded-consolidation', name: 'Weeded Consolidation', icon: '♻️' },
            { id: 'analytics', name: 'Shelf Analytics', icon: '📊' },
            { id: 'placement', name: 'Bulk Placement', icon: '📦' },
            { id: 'consolidation', name: 'Consolidation Plans', icon: '🔄' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                activeTab === tab.id
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.name}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="text-gray-600 mt-4">Analyzing storage data...</p>
        </div>
      )}

      {/* Tab Content */}
      {!loading && (
        <>
          {activeTab === 'overview' && renderOverview()}
          {activeTab === 'position-mapping' && renderPositionMapping()}
          {activeTab === 'weeded-consolidation' && renderWeededConsolidation()}
          {activeTab === 'analytics' && renderShelfAnalytics()}
          {activeTab === 'placement' && renderBasicTab('Bulk Placement', '📦', bulkZones)}
          {activeTab === 'consolidation' && renderBasicTab('Consolidation Plans', '🔄', consolidationPlans)}
        </>
      )}
    </div>
  );
};

export default StrategicAccession;