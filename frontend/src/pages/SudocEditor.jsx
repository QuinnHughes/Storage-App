// src/pages/SudocEditor.jsx
import React, { useState, useEffect, useCallback } from "react";
import apiFetch from '../api/client';
import { useSudocCarts } from '../hooks/useSudocCarts';

// Boundwith Modal Component
function BoundwithModal({ isOpen, onClose, currentRecord }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [selectedRecords, setSelectedRecords] = useState([]);
  const [mainRecord, setMainRecord] = useState(currentRecord);
  const [loading, setLoading] = useState(false);
  const [createMode, setCreateMode] = useState("existing"); // "existing" or "new-host"
  
  // Host record form fields
  const [hostTitle, setHostTitle] = useState("");
  const [hostSeries, setHostSeries] = useState("");
  const [hostPublisher, setHostPublisher] = useState("");
  const [hostSeriesNumber, setHostSeriesNumber] = useState("");
  const [hostSubjects, setHostSubjects] = useState([]);
  const [hostYear, setHostYear] = useState(new Date().getFullYear().toString());
  
  // Add current record to selected by default
  useEffect(() => {
    if (currentRecord && !selectedRecords.find(r => r.id === currentRecord.id)) {
      setSelectedRecords([currentRecord]);
    }
  }, [currentRecord]);
  
  // Extract series information from selected records
  useEffect(() => {
    if (createMode === "new-host" && selectedRecords.length > 0 && selectedRecords[0].fields) {
      // Try to extract series info from the first selected record
      const fields = selectedRecords[0].fields;
      
      // Look for committee/series in 088 field
      const field088 = fields.find(f => f.tag === '088');
      if (field088) {
        const subfields = field088.subfields || [];
        const value = subfields.find(sf => sf.code === 'a')?.value;
        if (value) setHostSeries(value);
      }
      
      // Look for publisher in 260 field
      const field260 = fields.find(f => f.tag === '260');
      if (field260) {
        const subfields = field260.subfields || [];
        const value = subfields.find(sf => sf.code === 'b')?.value;
        if (value) setHostPublisher(value);
      }
      
      // Look for series in 490 field
      const field490 = fields.find(f => f.tag === '490');
      if (field490) {
        const subfields = field490.subfields || [];
        const seriesTitle = subfields.find(sf => sf.code === 'a')?.value;
        const seriesNumber = subfields.find(sf => sf.code === 'v')?.value;
        if (seriesTitle) setHostSeries(seriesTitle);
        if (seriesNumber) setHostSeriesNumber(seriesNumber);
      }
      
      // Set a default title based on 088 or 490 field
      if (field088 || field490) {
        const seriesValue = field088?.subfields?.find(sf => sf.code === 'a')?.value || 
                            field490?.subfields?.find(sf => sf.code === 'a')?.value || 
                            "Government Document Series";
        setHostTitle(`${seriesValue} Collection`);
      }
    }
  }, [createMode, selectedRecords]);

  // Enhanced useEffect to extract MARC data from selected records
  useEffect(() => {
    if (createMode === "new-host" && selectedRecords.length > 0) {
      // First, fetch full MARC records for better data extraction
      const fetchMarcData = async () => {
        try {
          const recordPromises = selectedRecords.map(async record => {
            if (!record.fields) {
              const token = localStorage.getItem("token");
              const res = await apiFetch(`/catalog/sudoc/${record.id}`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {}
              });
              if (res.ok) {
                const fields = await res.json();
                return { ...record, fields };
              }
            }
            return record;
          });
          
          const recordsWithFields = await Promise.all(recordPromises);
          analyzeRecordsForHostData(recordsWithFields);
        } catch (error) {
          console.error("Error fetching MARC data:", error);
        }
      };
      
      fetchMarcData();
    }
  }, [createMode, selectedRecords]);

  // New function to analyze MARC records and extract common data
  const analyzeRecordsForHostData = (records) => {
    // Initialize data collections
    const seriesData = [];
    const publisherData = [];
    const committeeData = [];
    const subjects = [];
    const sudocPrefixes = [];
    
    // Helper function to safely extract subfield values
    const getSubfieldValue = (field, code) => {
      const subfields = field.subfields;
      
      // Case 1: subfields is an array of objects with code and value properties
      if (Array.isArray(subfields)) {
        const subfield = subfields.find(sf => {
          return typeof sf === 'object' && sf.code === code;
        });
        return subfield?.value;
      }
      
      // Case 2: subfields is an object with codes as keys
      if (typeof subfields === 'object' && subfields !== null) {
        return subfields[code];
      }
      
      return null;
    };
    
    // Extract data from each record
    records.forEach(record => {
      if (!record.fields) return;
      
      // Look for series in 490/830 fields
      record.fields.filter(f => f.tag === '490' || f.tag === '830').forEach(field => {
        const seriesTitle = getSubfieldValue(field, 'a');
        const seriesNumber = getSubfieldValue(field, 'v');
        
        if (seriesTitle) {
          seriesData.push({ title: seriesTitle, number: seriesNumber });
        }
      });
      
      // Extract publisher from 260/264 fields
      record.fields.filter(f => f.tag === '260' || f.tag === '264').forEach(field => {
        const publisher = getSubfieldValue(field, 'b');
        if (publisher) publisherData.push(publisher);
      });
      
      // Extract committee/agency info from 110/710 fields
      record.fields.filter(f => f.tag === '110' || f.tag === '710').forEach(field => {
        // Try to concatenate subfields for committee name
        let committee = "";
        
        if (Array.isArray(field.subfields)) {
          committee = field.subfields
            .filter(sf => typeof sf === 'object')
            .map(sf => sf.value)
            .join(' ');
        } else if (typeof field.subfields === 'object' && field.subfields !== null) {
          committee = Object.values(field.subfields).join(' ');
        }
        
        if (committee && committee.toLowerCase().includes('committee')) {
          committeeData.push(committee);
        }
      });
      
      // Extract SuDoc classification for common prefix
      record.fields.filter(f => f.tag === '086' && f.indicator1 === '0').forEach(field => {
        const sudoc = getSubfieldValue(field, 'a');
        
        if (sudoc) {
          // Get prefix (e.g., "Y 4.P 93/2:" from "Y 4.P 93/2:S.HRG.106-1095")
          const match = sudoc.match(/^([A-Z]\s*\d+\.[A-Z]\s*\d+\/?\d*:)/);
          if (match) sudocPrefixes.push(match[1]);
        }
      });
      
      // Extract subjects from 6XX fields
      record.fields.filter(f => f.tag.startsWith('6')).forEach(field => {
        // Try to concatenate subfields for subject
        let subject = "";
        
        if (Array.isArray(field.subfields)) {
          subject = field.subfields
            .filter(sf => typeof sf === 'object')
            .map(sf => sf.value)
            .join(' -- ');
        } else if (typeof field.subfields === 'object' && field.subfields !== null) {
          subject = Object.values(field.subfields).join(' -- ');
        }
        
        if (subject) subjects.push(subject);
      });
    });
    
    // Find most common series
    let commonSeries = null;
    if (seriesData.length > 0) {
      // Group by title
      const seriesGroups = seriesData.reduce((acc, item) => {
        acc[item.title] = acc[item.title] || { count: 0, numbers: [] };
        acc[item.title].count++;
        if (item.number) acc[item.title].numbers.push(item.number);
        return acc;
      }, {});
      
      // Find most common
      let maxCount = 0;
      let maxSeries = null;
      Object.entries(seriesGroups).forEach(([title, data]) => {
        if (data.count > maxCount) {
          maxCount = data.count;
          maxSeries = { title, numbers: data.numbers };
        }
      });
      
      commonSeries = maxSeries;
    }
    
    // Find most common publisher
    let commonPublisher = null;
    if (publisherData.length > 0) {
      const publisherCounts = publisherData.reduce((acc, pub) => {
        acc[pub] = (acc[pub] || 0) + 1;
        return acc;
      }, {});
      
      commonPublisher = Object.entries(publisherCounts)
        .sort((a, b) => b[1] - a[1])[0][0];
    }
    
    // Find most common committee
    let commonCommittee = null;
    if (committeeData.length > 0) {
      const committeeCounts = committeeData.reduce((acc, com) => {
        acc[com] = (acc[com] || 0) + 1;
        return acc;
      }, {});
      
      commonCommittee = Object.entries(committeeCounts)
        .sort((a, b) => b[1] - a[1])[0][0];
    }
    
    // Generate a title based on extracted information
    let suggestedTitle = "";
    
    if (commonCommittee) {
      // Use committee name as the basis for title
      suggestedTitle = `${commonCommittee} Collection`;
    } else if (commonSeries) {
      // Use series title
      suggestedTitle = `${commonSeries.title} Collection`;
    } else if (sudocPrefixes.length > 0) {
      // Try to create a title from SuDoc pattern
      const sudocCounts = sudocPrefixes.reduce((acc, prefix) => {
        acc[prefix] = (acc[prefix] || 0) + 1;
        return acc;
      }, {});
      
      const commonPrefix = Object.entries(sudocCounts)
        .sort((a, b) => b[1] - a[1])[0][0];
        
      // Translate common government document prefixes to readable titles
      if (commonPrefix.startsWith("Y 4.")) {
        suggestedTitle = "Congressional Committee Publications";
      } else if (commonPrefix.startsWith("Y 1.")) {
        suggestedTitle = "Congressional Documents";
      } else {
        suggestedTitle = "Government Document Collection";
      }
    } else {
      suggestedTitle = "Bound Documents Collection";
    }
    
    // Extract common subject themes (for potential use in title/description)
    const commonSubjects = [];
    if (subjects.length > 0) {
      // Get all subject components
      const subjectParts = subjects.flatMap(s => s.split(' -- '));
      
      // Count frequencies
      const subjectCounts = subjectParts.reduce((acc, part) => {
        acc[part] = (acc[part] || 0) + 1;
        return acc;
      }, {});
      
      // Get subjects that appear in at least half the records
      Object.entries(subjectCounts)
        .filter(([_, count]) => count >= records.length / 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .forEach(([subject]) => commonSubjects.push(subject));
    }
    
    // If we have common subjects, incorporate into title
    if (commonSubjects.length > 0 && !suggestedTitle.includes(commonSubjects[0])) {
      suggestedTitle = `${commonSubjects[0]} - ${suggestedTitle}`;
    }
    
    // Update form fields with extracted data
    setHostTitle(suggestedTitle);
    setHostSeries(commonSeries?.title || "");
    setHostSeriesNumber(commonSeries?.numbers?.[0] || "");
    setHostPublisher(commonPublisher || "");
    
    // Additional metadata for enhanced host record
    if (commonSubjects.length > 0) {
      setHostSubjects(commonSubjects);
    }
  };

  // Search for records to add to boundwith
  const handleSearch = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/catalog/sudoc/search?query=${searchQuery}`);
      const data = await res.json();
      setSearchResults(data.filter(r => r.id !== currentRecord.id));
    } catch (error) {
      console.error("Error searching records:", error);
    } finally {
      setLoading(false);
    }
  };

  // Toggle record selection
  const toggleRecordSelection = (record) => {
    setSelectedRecords(prev => 
      prev.find(r => r.id === record.id)
        ? prev.filter(r => r.id !== record.id)
        : [...prev, record]
    );
  };

  // Change which record is the "main" record
  const setAsMainRecord = (record) => {
    setMainRecord(record);
  };

  // Create the boundwith relationships
  const createBoundwith = async () => {
    if (selectedRecords.length < 2 && createMode === "existing") {
      alert("You need at least 2 records to create a boundwith");
      return;
    }

    if (createMode === "new-host" && (!hostTitle || selectedRecords.length === 0)) {
      alert("Please enter a title for the host record and select at least one record");
      return;
    }

    try {
      // Call API to create boundwith relationship
      const res = await apiFetch('/catalog/sudoc/boundwith', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({
          creation_mode: createMode,
          main_record_id: createMode === "existing" ? mainRecord.id : null,
          related_record_ids: selectedRecords.map(r => r.id),
          host_record: createMode === "new-host" ? {
            title: hostTitle,
            series: hostSeries,
            publisher: hostPublisher,
            series_number: hostSeriesNumber,
            year: hostYear,
            subjects: hostSubjects
          } : null
        })
      });

      if (res.ok) {
        const data = await res.json();
        alert(`Boundwith relationship created successfully! ${data.message || ''}`);
        onClose();
      } else {
        const error = await res.text();
        throw new Error(error || "Failed to create boundwith");
      }
    } catch (error) {
      console.error("Error creating boundwith:", error);
      alert("Failed to create boundwith relationship: " + error.message);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4 border-b pb-4">
          <h3 className="text-xl font-semibold">Create Boundwith Relationship</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>
        
        {/* Boundwith type selection */}
        <div className="mb-6 bg-gray-50 p-4 rounded-lg">
          <h4 className="font-medium mb-3">Boundwith Creation Method</h4>
          <div className="flex flex-col sm:flex-row gap-4">
            <div 
              onClick={() => setCreateMode("existing")}
              className={`border p-4 rounded-lg flex-1 cursor-pointer ${
                createMode === "existing" ? "border-blue-500 bg-blue-50" : "border-gray-300"
              }`}
            >
              <div className="font-medium mb-1">Use Existing Record as Host</div>
              <p className="text-sm text-gray-600">
                Select one record to be the "main" record, with all others bound to it
              </p>
            </div>
            <div 
              onClick={() => setCreateMode("new-host")} 
              className={`border p-4 rounded-lg flex-1 cursor-pointer ${
                createMode === "new-host" ? "border-yellow-500 bg-yellow-50" : "border-gray-300"
              }`}
            >
              <div className="font-medium mb-1">Create Series-Level Host Record</div>
              <p className="text-sm text-gray-600">
                Create a new record at the series level (recommended for government documents)
              </p>
            </div>
          </div>
        </div>
        
        {/* New host record form - only shown in new-host mode */}
        {createMode === "new-host" && (
          <div className="mb-6 border p-4 rounded-lg">
            <h4 className="font-medium mb-3">Series-Level Host Record Details</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Host Record Title</label>
                <input
                  type="text"
                  value={hostTitle}
                  onChange={(e) => setHostTitle(e.target.value)}
                  className="w-full border rounded px-3 py-2"
                  placeholder="Collection Title"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Series</label>
                <input
                  type="text"
                  value={hostSeries}
                  onChange={(e) => setHostSeries(e.target.value)}
                  className="w-full border rounded px-3 py-2"
                  placeholder="Series Title or Committee Name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Publisher</label>
                <input
                  type="text"
                  value={hostPublisher}
                  onChange={(e) => setHostPublisher(e.target.value)}
                  className="w-full border rounded px-3 py-2"
                  placeholder="Publisher"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Series Number</label>
                <input
                  type="text"
                  value={hostSeriesNumber}
                  onChange={(e) => setHostSeriesNumber(e.target.value)}
                  className="w-full border rounded px-3 py-2"
                  placeholder="Series Number"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Publication Year</label>
                <input
                  type="text"
                  value={hostYear}
                  onChange={(e) => setHostYear(e.target.value)}
                  className="w-full border rounded px-3 py-2"
                  placeholder="Publication Year"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Common Subjects</label>
                <div className="border rounded px-3 py-2 bg-gray-50 min-h-[38px]">
                  {hostSubjects.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {hostSubjects.map((subject, i) => (
                        <span key={i} className="bg-blue-100 text-blue-800 px-2 py-1 text-xs rounded">
                          {subject}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-gray-400">No common subjects found</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Search section */}
        <div className="mb-6">
          <h4 className="font-medium mb-2">Find Records to Include</h4>
          <div className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 border rounded px-3 py-2"
              placeholder="Search by SuDoc number or title..."
            />
            <button
              onClick={handleSearch}
              disabled={loading}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:bg-blue-300"
            >
              {loading ? "Searching..." : "Search"}
            </button>
          </div>
        </div>
        
        {/* Search results */}
        {searchResults.length > 0 && (
          <div className="mb-6">
            <h4 className="font-medium mb-2">Search Results</h4>
            <div className="max-h-48 overflow-y-auto border rounded">
              {searchResults.map(record => (
                <div 
                  key={`result-${record.id}`}
                  className="p-2 border-b hover:bg-gray-50 flex justify-between"
                >
                  <div>
                    <div className="font-medium">{record.title}</div>
                    <div className="text-sm text-gray-600">SuDoc: {record.sudoc}</div>
                  </div>
                  <button
                    onClick={() => toggleRecordSelection(record)}
                    className={`px-3 py-1 rounded text-sm ${
                      selectedRecords.find(r => r.id === record.id)
                        ? "bg-red-500 text-white hover:bg-red-600"
                        : "bg-green-500 text-white hover:bg-green-600"
                    }`}
                  >
                    {selectedRecords.find(r => r.id === record.id) ? "Remove" : "Add"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Selected records */}
        <div className="mb-6">
          <h4 className="font-medium mb-2">Selected Records ({selectedRecords.length})</h4>
          {createMode === "existing" && (
            <p className="text-sm mb-2 text-gray-600">
              Select which record should be the main record (the physical item all others are bound with).
            </p>
          )}
          {createMode === "new-host" && (
            <p className="text-sm mb-2 text-gray-600">
              These records will be linked to the new host record.
            </p>
          )}
          <div className="border rounded divide-y">
            {selectedRecords.map(record => (
              <div 
                key={`selected-${record.id}`}
                className={`p-3 flex justify-between items-center ${
                  createMode === "existing" && mainRecord?.id === record.id ? "bg-yellow-50" : ""
                }`}
              >
                <div>
                  <div className="font-medium">{record.title}</div>
                  <div className="text-sm text-gray-600">
                    SuDoc: {record.sudoc} | OCLC: {record.oclc || "—"}
                  </div>
                </div>
                <div className="flex gap-2">
                  {createMode === "existing" && (
                    mainRecord?.id === record.id ? (
                      <span className="bg-yellow-500 text-white px-3 py-1 rounded text-sm">
                        Main Record
                      </span>
                    ) : (
                      <button
                        onClick={() => setAsMainRecord(record)}
                        className="bg-yellow-500 text-white px-3 py-1 rounded text-sm hover:bg-yellow-600"
                      >
                        Set as Main
                      </button>
                    )
                  )}
                  <button
                    onClick={() => toggleRecordSelection(record)}
                    className="bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
            
            {selectedRecords.length === 0 && (
              <p className="p-3 italic text-gray-500">No records selected</p>
            )}
          </div>
        </div>
        
        {/* Action buttons */}
        <div className="flex justify-end space-x-3 pt-4 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 border rounded hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={createBoundwith}
            disabled={(createMode === "existing" && (selectedRecords.length < 2 || !mainRecord)) || 
                     (createMode === "new-host" && (selectedRecords.length === 0 || !hostTitle))}
            className="bg-yellow-500 hover:bg-yellow-600 text-white px-6 py-2 rounded font-medium disabled:bg-gray-300"
          >
            Create Boundwith
          </button>
        </div>
      </div>
    </div>
  );
}

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
    l: 'ssd', // default location
    i: '',    // barcode
    c: '',    // call number
    n: ''     // enumeration/chronology
  });
  const [showBoundwithModal, setShowBoundwithModal] = useState(false);

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
          
          const response = await res.json();
          // Fix: extract the items array from the response
          const cartRecords = response.items || [];
          
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

  // Helper function to check if a record is part of a boundwith relationship
  const isBoundwith = useCallback((recordId) => {
    if (!marcFields[recordId]) return false;
    
    return marcFields[recordId].some(field => 
      field.tag === '501' || // With note
      field.tag === '773' || // Host item entry
      field.tag === '774'    // Constituent unit entry
    );
  }, [marcFields]);

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
                  <div className="text-sm leading-tight flex items-center gap-2">
                    {formatItemDisplay(rec)}
                    {isBoundwith(rec.id) && (
                      <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">
                        Boundwith
                      </span>
                    )}
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
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowAddField(true)}
                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition duration-150"
                      >
                        + Add 945 Field
                      </button>
                      <button
                        onClick={() => setShowBoundwithModal(true)}
                        className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition duration-150"
                      >
                        + Create Boundwith
                      </button>
                    </div>
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

      {/* Boundwith Modal */}
      {showBoundwithModal && (
        <BoundwithModal 
          isOpen={showBoundwithModal}
          onClose={() => setShowBoundwithModal(false)}
          currentRecord={selected}
        />
      )}
    </div>
  );
}
