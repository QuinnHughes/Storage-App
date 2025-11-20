// src/pages/SudocEditor.jsx
import React, { useState, useEffect, useCallback, useRef } from "react";
import apiFetch from '../api/client';
import { useSudocCarts } from '../hooks/useSudocCarts';

// Boundwith Modal Component
function BoundwithModal({ isOpen, onClose, currentRecord, onBoundwithCreated }) {
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
  
  // Holdings and item information
  const [holdingsLocation, setHoldingsLocation] = useState("main");
  const [holdingsCallNumber, setHoldingsCallNumber] = useState("");
  const [itemBarcode, setItemBarcode] = useState("");
  const [itemPolicy, setItemPolicy] = useState("book");
  const [itemEnumeration, setItemEnumeration] = useState("");
  const [itemChronology, setItemChronology] = useState("");
  // Preview state for auto-generated host & 774 lines
  const [preview, setPreview] = useState(null);
  const [userTouchedTitle, setUserTouchedTitle] = useState(false);
  
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

  // Fetch backend preview (normalized 774 + suggested title) when creating new host
  useEffect(() => {
    if (createMode !== 'new-host' || selectedRecords.length === 0) {
      setPreview(null);
      return;
    }
    const controller = new AbortController();
    (async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await apiFetch('/catalog/sudoc/boundwith/build', {
          method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {})
            },
            body: JSON.stringify({ record_ids: selectedRecords.map(r => r.id) }),
            signal: controller.signal
        });
        if (!res.ok) return;
        const data = await res.json();
        setPreview(data);
        if (!userTouchedTitle && data.host_title && !hostTitle) {
          setHostTitle(data.host_title);
        }
        if (data.publisher && !hostPublisher) setHostPublisher(data.publisher);
        if (data.subjects && data.subjects.length && hostSubjects.length === 0) setHostSubjects(data.subjects);
      } catch (e) {
        if (e.name !== 'AbortError') console.error('Preview build failed', e);
      }
    })();
    return () => controller.abort();
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

    if (!holdingsLocation) {
      alert("Location is required for holdings creation");
      return;
    }

    if (!itemBarcode && createMode === "new-host") {
      const proceed = window.confirm("No barcode provided. This will create a boundwith without a physical item record. Continue anyway?");
      if (!proceed) return;
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
          } : null,
          holdings_data: {
            location_code: holdingsLocation,
            call_number: holdingsCallNumber,
            barcode: itemBarcode,
            item_policy: itemPolicy,
            enumeration: itemEnumeration,
            chronology: itemChronology
          }
        })
      });

      if (res.ok) {
        const data = await res.json();
        alert(`Boundwith relationship created successfully! ${data.message || ''}`);

        // Build host + children context for parent editor
        if (onBoundwithCreated) {
          if (createMode === "new-host") {
            // New host: we have title from form; children are selectedRecords
            onBoundwithCreated({
              mode: 'new-host',
              host: {
                id: data.host_id,
                title: hostTitle || 'Host Record',
                sudoc: '',
                oclc: '',
                isHost: true,
                childIds: data.child_ids || selectedRecords.map(r => r.id)
              },
              children: selectedRecords
            });
          } else {
            // Existing host: mainRecord becomes host
            onBoundwithCreated({
              mode: 'existing',
              host: {
                id: data.host_id,
                title: mainRecord.title,
                sudoc: mainRecord.sudoc,
                oclc: mainRecord.oclc,
                isHost: true,
                childIds: data.child_ids
              },
              children: selectedRecords.filter(r => r.id !== mainRecord.id)
            });
          }
        }

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
                <label className="block text-sm font-medium mb-1">Host Record Title (245)</label>
                <input
                  type="text"
                  value={hostTitle}
                  onChange={(e) => { setHostTitle(e.target.value); setUserTouchedTitle(true); }}
                  className="w-full border rounded px-3 py-2"
                  placeholder="Collection Title"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Series (830)</label>
                <input
                  type="text"
                  value={hostSeries}
                  onChange={(e) => setHostSeries(e.target.value)}
                  className="w-full border rounded px-3 py-2"
                  placeholder="Series Title or Committee Name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Publisher (260/264)</label>
                <input
                  type="text"
                  value={hostPublisher}
                  onChange={(e) => setHostPublisher(e.target.value)}
                  className="w-full border rounded px-3 py-2"
                  placeholder="Publisher"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Series Number (490$v)</label>
                <input
                  type="text"
                  value={hostSeriesNumber}
                  onChange={(e) => setHostSeriesNumber(e.target.value)}
                  className="w-full border rounded px-3 py-2"
                  placeholder="Series Number"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Publication Year (260$c/264$c)</label>
                <input
                  type="text"
                  value={hostYear}
                  onChange={(e) => setHostYear(e.target.value)}
                  className="w-full border rounded px-3 py-2"
                  placeholder="Publication Year"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Common Subjects (6XX)</label>
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

        {/* Auto-generated Preview (new-host mode) */}
        {createMode === "new-host" && preview && (
          <div className="mb-6 border p-4 rounded-lg bg-gray-50">
            <h4 className="font-medium mb-2">Auto-generated Preview (774 lines)</h4>
            {preview.host_title && !userTouchedTitle && hostTitle !== preview.host_title && (
              <div className="text-xs text-blue-700 mb-2">Suggested title applied from analysis.</div>
            )}
            <div className="text-xs font-mono whitespace-pre-wrap bg-white border rounded p-3 max-h-40 overflow-y-auto">
              {preview.lines_774 && preview.lines_774.length > 0 ? (
                preview.lines_774.map((l, i) => (
                  <div key={i}>
                    774 08 $i {l.i} $t {l.t}{l.w ? ` $w ${l.w}` : ''}{l.g ? ` $g ${l.g}` : ''}
                  </div>
                ))
              ) : (
                <div className="text-gray-500">No 774 lines generated yet.</div>
              )}
            </div>
            <p className="mt-2 text-[11px] text-gray-500">
              These 774 fields will be created when you finalize the boundwith.
            </p>
          </div>
        )}
        
        {/* Holdings Information (852) */}
        <div className="mb-6 border p-4 rounded-lg">
          <h4 className="font-medium mb-3">Holdings Information (852)</h4>
          <p className="text-sm text-gray-600 mb-4">
            This information represents where the physical item is stored.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Location (852$l)</label>
              <select
                value={holdingsLocation}
                onChange={(e) => setHoldingsLocation(e.target.value)}
                className="w-full border rounded px-3 py-2"
              >
                <option value="ssd">Storage Documents</option>
                <option value="mmd">Morgan Documents</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Call Number (852$c)</label>
              <input
                type="text"
                value={holdingsCallNumber}
                onChange={(e) => setHoldingsCallNumber(e.target.value)}
                className="w-full border rounded px-3 py-2"
                placeholder="Call number for shelving"
              />
            </div>
          </div>
        </div>

        {/* Item Information (945) */}
        <div className="mb-6 border p-4 rounded-lg">
          <h4 className="font-medium mb-3">Item Information (945)</h4>
          <p className="text-sm text-gray-600 mb-4">
            This information describes the specific physical item.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Barcode (945$i)</label>
              <input
                type="text"
                value={itemBarcode}
                onChange={(e) => setItemBarcode(e.target.value)}
                className="w-full border rounded px-3 py-2"
                placeholder="Item barcode"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Item Policy (945$p)</label>
              <select
                value={itemPolicy}
                onChange={(e) => setItemPolicy(e.target.value)}
                className="w-full border rounded px-3 py-2"
              >
                <option value="serial">Serial</option>
                <option value="periodical">Periodical</option>
                <option value="monograph">Monograph</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Enumeration (945$e)</label>
              <input
                type="text"
                value={itemEnumeration}
                onChange={(e) => setItemEnumeration(e.target.value)}
                className="w-full border rounded px-3 py-2"
                placeholder="v.1, pt.2, etc."
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Chronology (945$n)</label>
              <input
                type="text"
                value={itemChronology}
                onChange={(e) => setItemChronology(e.target.value)}
                className="w-full border rounded px-3 py-2"
                placeholder="2023, Jan-Mar, etc."
              />
            </div>
          </div>
        </div>
        
        <div className="mt-2 text-xs text-gray-500">
          <p className="mb-1">
            <strong>Note:</strong> For proper ALMA import, at minimum you should provide:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Location (required for holdings)</li>
            <li>Call number (used for shelving)</li>
            <li>Barcode (unique identifier for the physical item)</li>
          </ul>
        </div>
        
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

function CreatedHostsModal({ isOpen, onClose, onLoadHost }) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({ results: [], page: 1, total: 0, count: 0 });

  const fetchHosts = async () => {
    if (!isOpen) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/catalog/sudoc/boundwith/hosts?q=${encodeURIComponent(q)}&page=${page}&page_size=${pageSize}`, {
        headers: localStorage.getItem("token") ? { Authorization: `Bearer ${localStorage.getItem("token")}` } : {}
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (e) {
      console.error("Failed to load created hosts", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchHosts(); /* eslint-disable-next-line */ }, [isOpen, page]);

  const onSearch = (e) => {
    e.preventDefault();
    setPage(1);
    fetchHosts();
  };

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-6 overflow-auto">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="text-lg font-semibold">Created Boundwith Hosts</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">✕</button>
        </div>
        <form onSubmit={onSearch} className="px-5 py-3 flex gap-2 border-b">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search host title..."
            className="flex-1 border rounded px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded"
            disabled={loading}
          >
            {loading ? "Searching..." : "Search"}
          </button>
        </form>
        <div className="max-h-[50vh] overflow-y-auto divide-y">
          {loading && <div className="p-4 text-sm text-gray-500">Loading...</div>}
          {!loading && data.results.length === 0 && (
            <div className="p-4 text-sm text-gray-500">No hosts found.</div>
          )}
          {data.results.map(r => (
            <div key={r.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1">
                <div className="font-medium text-sm">{r.title}</div>
                <div className="text-xs text-gray-500">
                  ID #{r.id} • {r.child_ids.length} constituent{r.child_ids.length !== 1 && 's'}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => onLoadHost(r)}
                  className="px-3 py-1.5 text-xs bg-green-600 hover:bg-green-700 text-white rounded"
                >Load</button>
              </div>
            </div>
          ))}
        </div>
        <div className="px-5 py-3 flex items-center justify-between border-t text-xs">
          <div>
            Page {data.page} • Showing {data.count} • Total {data.total}
          </div>
            <div className="flex gap-2">
              <button
                className="px-2 py-1 border rounded disabled:opacity-40"
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
              >Prev</button>
              <button
                className="px-2 py-1 border rounded disabled:opacity-40"
                disabled={data.count < pageSize}
                onClick={() => setPage(p => p + 1)}
              >Next</button>
            </div>
        </div>
      </div>
    </div>
  );
}

function HostBrowserModal({ isOpen, onClose, onLoadHost, carts = [], selectedCart, loadCarts }) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ page: 1, count: 0 });
  const [expanded, setExpanded] = useState(new Set());

  const fetchHosts = async () => {
    if (!isOpen) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/catalog/sudoc/boundwith/hosts?q=${encodeURIComponent(q)}&page=${page}&page_size=${pageSize}`, {
        headers: localStorage.getItem("token") ? { Authorization: `Bearer ${localStorage.getItem("token")}` } : {}
      });
      if (res.ok) {
        const json = await res.json();
        setRows(json.results);
        setMeta({ page: json.page, count: json.count });
      }
    } catch (e) {
      console.error("Host search failed", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchHosts(); /* eslint-disable-next-line */ }, [isOpen, page]);

  const toggleExpand = (id) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // New function to handle adding host record to cart
  const handleAddToCart = async (hostRecord, includeChildren = false) => {
    console.log("handleAddToCart called with:", { hostRecord, includeChildren, selectedCart });
    
    if (!selectedCart) { // Now selectedCart is defined as a prop
      alert("Please select a cart first");
      return;
    }
    
    if (!loadCarts) {
      console.error("loadCarts function not available");
      alert("Cart refresh function not available");
      return;
    }
    
    try {
      console.log(`Adding host ${hostRecord.id} to cart ${selectedCart}, includeChildren: ${includeChildren}`);
      setLoading(true);
      const startTime = Date.now();
      
      const token = localStorage.getItem("token");
      console.log("Token available:", !!token);
      console.log("Request URL:", `/catalog/sudoc/cart/${selectedCart}/hosts/${hostRecord.id}?include_children=${includeChildren}`);
      
      const response = await apiFetch(
        `/catalog/sudoc/cart/${selectedCart}/hosts/${hostRecord.id}?include_children=${includeChildren}`,
        { 
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );
      
      const endTime = Date.now();
      console.log(`Cart add operation took ${endTime - startTime}ms`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Cart add failed:", errorText);
        throw new Error(`Failed to add to cart: ${response.status}`);
      }
      
      const data = await response.json();
      console.log("Cart add response:", data);
      
      // Refresh cart data to show new items
      console.log("Refreshing carts after successful add...");
      await loadCarts();
      console.log("Cart refresh completed");
      
      const message = includeChildren 
        ? `Added host and ${data.children_added?.length || 0} children to cart` 
        : "Added host record to cart";
      console.log("Success:", message);
      alert(message);
      return true;
    } catch (error) {
      console.error("Error adding host to cart:", error);
      alert(`Failed to add to cart: ${error.message}`);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteHost = async (hostId) => {
    if (!confirm(`Are you sure you want to delete host record #${hostId}?`)) {
      return;
    }
    
    try {
      const token = localStorage.getItem("token");
      const res = await apiFetch(`/catalog/sudoc/boundwith/hosts/${hostId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      
      if (res.ok) {
        // Remove from local state
        setRows(rows.filter(r => r.id !== hostId));
        alert(`Host record #${hostId} deleted successfully`);
      } else {
        alert('Failed to delete host record');
      }
    } catch (err) {
      console.error('Error deleting host:', err);
      alert('Error deleting host record');
    }
  };
  
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-6 overflow-auto">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="text-lg font-semibold">Boundwith Hosts</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">✕</button>
        </div>
        <div className="px-5 py-3 border-b flex gap-2">
          <input
            className="flex-1 border rounded px-3 py-2 text-sm"
            placeholder="Search host title..."
            value={q}
            onChange={e => { setQ(e.target.value); setPage(1); }}
            onKeyDown={e => { if (e.key === 'Enter') fetchHosts(); }}
          />
          <button
            onClick={() => { setPage(1); fetchHosts(); }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded"
            disabled={loading}
          >
            {loading ? "Searching..." : "Search"}
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 text-gray-600 uppercase text-xs">
              <tr>
                <th className="p-2 w-10"></th>
                <th className="p-2 text-left">Title</th>
                <th className="p-2 w-24 text-center">Children</th>
                <th className="p-2 w-40">Created</th>
                <th className="p-2 w-36"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={5} className="p-4 text-center text-gray-500">Loading…</td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={5} className="p-4 text-center text-gray-500">No hosts found.</td></tr>
              )}
              {rows.map(r => {
                const isExp = expanded.has(r.id);
                return (
                  <React.Fragment key={r.id}>
                    <tr className="border-b hover:bg-gray-50">
                      <td className="p-2 text-center">
                        <button
                          onClick={() => toggleExpand(r.id)}
                          className="text-gray-500 hover:text-gray-700"
                          title={isExp ? "Collapse" : "Expand"}
                        >{isExp ? '▾' : '▸'}</button>
                      </td>
                      <td className="p-2">
                        <span className="font-medium">{r.title}</span>
                      </td>
                      <td className="p-2 text-center">{r.child_count ?? (r.child_ids ? r.child_ids.length : 0)}</td>
                      <td className="p-2 text-xs text-gray-500">
                        {r.created_at ? new Date(r.created_at).toLocaleString() : '—'}
                      </td>
                      <td className="p-2 text-right">
                        <div className="flex gap-1 justify-end">
                          <button
                            onClick={() => onLoadHost(r)}
                            className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs"
                          >
                            Load
                          </button>
                          
                          <button
                            onClick={() => handleAddToCart(r, false)}
                            disabled={!selectedCart}
                            className={`px-2 py-1 text-xs rounded ${
                              !selectedCart 
                                ? 'bg-gray-200 text-gray-500' 
                                : 'bg-blue-600 hover:bg-blue-700 text-white'
                            }`}
                            title="Add host record to cart"
                          >
                            Add to Cart
                          </button>
                          
                          <button
                            onClick={() => handleDeleteHost(r.id)}
                            className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExp && r.children && r.children.length > 0 && (
                      <tr className="bg-gray-50 border-b">
                        <td></td>
                        <td colSpan={4} className="p-3">
                          <div className="text-xs font-semibold text-gray-600 mb-2">Constituents</div>
                          <ul className="grid gap-1 sm:grid-cols-2 md:grid-cols-3">
                            {r.children.map(c => (
                              <li key={`${r.id}-child-${c.id}`} className="p-2 bg-white rounded border flex flex-col">
                                <span className="font-medium text-xs">
                                  #{c.id ?? '—'} {c.title || 'Untitled'}
                                </span>
                                <button
                                  disabled={c.id == null}
                                  onClick={() => onLoadHost({ ...r, child_ids: r.child_ids })}
                                  className="mt-1 self-start text-blue-600 hover:underline text-2xs disabled:text-gray-400"
                                >
                                  Open Host
                                </button>
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 flex items-center justify-between border-t text-xs">
          <div>
            Page {page} • Showing {rows.length} • Total {meta.count}
          </div>
          <div className="flex gap-2">
            <button
              className="px-2 py-1 border rounded disabled:opacity-40"
              disabled={page <= 1 || loading}
              onClick={() => setPage(p => Math.max(1, p - 1))}
            >Prev</button>
            <button
              className="px-2 py-1 border rounded disabled:opacity-40"
              disabled={loading || rows.length < pageSize}
              onClick={() => setPage(p => p + 1)}
            >Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SudocEditor() {
  const [records, setRecords] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [marcFields, setMarcFields] = useState({});
  const [loadingIds, setLoadingIds] = useState(new Set());
  const [editingField, setEditingField] = useState(null);
  const [editedFields, setEditedFields] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [workingMode, setWorkingMode] = useState('checkout');
  const [showAddField, setShowAddField] = useState(false);
  const [loading, setLoading] = useState(false); // Add this line
  const [isTyping, setIsTyping] = useState(false);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const [newField945, setNewField945] = useState({
    l: 'ssd',
    i: '',
    c: '',
    n: ''
  });
  const [showBoundwithModal, setShowBoundwithModal] = useState(false);
  const [showCreatedHosts, setShowCreatedHosts] = useState(false);
  const [showHostBrowser, setShowHostBrowser] = useState(false);

  const { 
    carts, 
    selectedCart,
    setSelectedCart,
    createCart,
    addToCart,
    removeFromCart,
    deleteCart,
    loadCarts
  } = useSudocCarts();

  // Calculate selected record - moved before callbacks that use it
  const selected = records.find((r) => r.id === selectedId);
  const fields = selectedId != null ? marcFields[selectedId] : null;
  const isLoading = loadingIds.has(selectedId);

  // Helper function to refresh boundwith info for a record
  const refreshBoundwithInfo = async (recordId) => {
    try {
      const token = localStorage.getItem("token");
      const boundwithRes = await apiFetch(
        `/catalog/sudoc/lookup/${recordId}?include_children=false`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      
      if (boundwithRes.ok) {
        const recordInfo = await boundwithRes.json();
        // Update the record in our records array
        setRecords(prev => prev.map(record => {
          if (record.id === recordId) {
            return {
              ...record,
              isHost: recordInfo.isHost || false,
              childIds: recordInfo.childIds || [],
              title: recordInfo.title || record.title // Update title if available
            };
          }
          return record;
        }));
      }
    } catch (err) {
      console.error(`Failed to refresh boundwith info for ${recordId}:`, err);
    }
  };

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
          setLoading(true);
          const token = localStorage.getItem("token");
          const res = await apiFetch(`/catalog/sudoc/cart/${selectedCart}/records`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          
          if (!res.ok) {
            throw new Error(`Failed to fetch cart records: ${res.status}`);
          }
          
          const response = await res.json();
          // Extract the items array from the response
          const cartItems = response.items || [];
          
          // For each item that's a host, fetch its boundwith info
          const processedRecords = await Promise.all(
            cartItems.map(async (item) => {
              // Check if this might be a host record
              try {
                console.log(`Checking if record ${item.id} is a host`);
                const boundwithRes = await apiFetch(
                  `/catalog/sudoc/lookup/${item.id}?include_children=true`,
                  { headers: token ? { Authorization: `Bearer ${token}` } : {} }
                );
                
                if (boundwithRes.ok) {
                  const recordInfo = await boundwithRes.json();
                  console.log(`Record ${item.id} info:`, recordInfo);
                  
                  // If it's a host record, add the necessary properties
                  if (recordInfo.isHost && recordInfo.childIds?.length > 0) {
                    console.log(`Record ${item.id} is a host with ${recordInfo.childIds.length} children`);
                    return {
                      ...item,
                      isHost: true,
                      _isHostRow: true,  // Add the UI flag
                      childIds: recordInfo.childIds,
                      childRecords: recordInfo.childRecords || [],
                    };
                  }
                }
              } catch (err) {
                console.error(`Failed to fetch boundwith info for ${item.id}`, err);
              }
              return item;
            })
          );
          
          setRecords(processedRecords);
          setWorkingMode('cart');
          setSelectedId(processedRecords[0]?.id || null);
        } catch (err) {
          console.error('Failed to fetch cart records:', err);
          setRecords([]);
          setWorkingMode('cart');
          setSelectedId(null);
        } finally {
          setLoading(false);
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

  // Auto-save functionality with debouncing
  const autoSaveTimeoutRef = useRef(null);
  const savingFieldsRef = useRef(new Set());
  const typingTimeoutRef = useRef(null);
  
  const scheduleAutoSave = (fieldIndex) => {
    // Skip if auto-save is disabled
    if (!autoSaveEnabled) {
      return;
    }
    
    // Clear any existing timeout for this field
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    
    // Clear typing timeout and set typing state
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    setIsTyping(true);
    
    // Reset typing state after a short delay
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
    }, 500);
    
    // Don't schedule if already saving this field or user is typing
    if (savingFieldsRef.current.has(fieldIndex)) {
      return;
    }
    
    autoSaveTimeoutRef.current = setTimeout(() => {
      // Double-check user isn't typing and auto-save is still enabled
      if (!isTyping && autoSaveEnabled) {
        handleSaveField(fieldIndex, true); // true flag indicates auto-save
      }
    }, 4000); // Auto-save after 4 seconds of inactivity
  };

  // Update the handleSaveField function to connect to your existing backend endpoint
  const handleSaveField = async (fieldIndex, isAutoSave = false) => {
    console.log(`handleSaveField called: fieldIndex=${fieldIndex}, isAutoSave=${isAutoSave}`);
    
    // Prevent duplicate saves
    if (savingFieldsRef.current.has(fieldIndex)) {
      console.log(`Already saving field ${fieldIndex}, skipping...`);
      return;
    }
    
    // Clear any pending auto-save
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = null;
    }
    
    try {
      setIsSaving(true);
      savingFieldsRef.current.add(fieldIndex);
      
      const editedField = editedFields[fieldIndex];
      if (!editedField) {
        if (!isAutoSave) console.error("No edits found for this field");
        return;
      }
      
      // Create a properly formatted field for the API
      const updatedField = {
        tag: editedField.tag,
        indicators: [editedField.ind1 || ' ', editedField.ind2 || ' '],
        subfields: Object.entries(editedField.subfields || {}).map(([code, value]) => ({
          code,
          value
        }))
      };
      
      const response = await apiFetch(`/catalog/sudoc/${selectedId}/field/${fieldIndex}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify(updatedField)
      });
      
      if (!response.ok) {
        throw new Error(`Failed to save: ${response.status}`);
      }
      
      // Update local state with the array of fields returned from the API
      const updatedFields = await response.json();
      console.log(`Received ${updatedFields.length} fields from server after saving field ${fieldIndex}`);
      
      // IMPORTANT: Only update the fields for this specific record ID
      setMarcFields(prev => {
        console.log(`Updating marcFields for record ${selectedId}: ${prev[selectedId]?.length || 0} -> ${updatedFields.length} fields`);
        return {
          ...prev,
          [selectedId]: updatedFields
        };
      });
      
      // Clear ALL edited state since field indexes may have changed due to sorting
      setEditedFields({});
      setEditingField(null);
      console.log(`Cleared all edited state after save - fields are now sorted`);
      
      // Show success notification (only for manual saves)
      if (!isAutoSave) {
        // Use a more subtle notification instead of alert
        const notification = document.createElement('div');
        notification.textContent = 'Field saved successfully - fields reordered numerically';
        notification.className = 'fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded shadow-lg z-50';
        document.body.appendChild(notification);
        setTimeout(() => document.body.removeChild(notification), 3000);
      }
    } catch (error) {
      console.error("Error saving field:", error);
      alert(`Failed to save: ${error.message}`);
    } finally {
      setIsSaving(false);
      savingFieldsRef.current.delete(fieldIndex);
    }
  };

  // Delete field function
  const handleDeleteField = async (fieldIndex) => {
    if (!confirm('Are you sure you want to delete this field?')) {
      return;
    }

    // Prevent delete if already saving
    if (savingFieldsRef.current.has(fieldIndex)) {
      alert('Cannot delete field while saving');
      return;
    }

    try {
      setIsSaving(true);
      savingFieldsRef.current.add(fieldIndex);
      
      console.log(`Deleting field at index ${fieldIndex}`);
      
      const response = await apiFetch(`/catalog/sudoc/${selectedId}/field/${fieldIndex}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to delete field: ${response.status}`);
      }
      
      // Update local state with the array of fields returned from the API
      const updatedFields = await response.json();
      console.log(`Received ${updatedFields.length} fields from server after deleting field ${fieldIndex}`);
      
      // Update the fields for this record
      setMarcFields(prev => ({
        ...prev,
        [selectedId]: updatedFields
      }));
      
      // Clear any edited state for fields (indexes may have shifted)
      setEditedFields({});
      setEditingField(null);
      
      // Show success notification
      const notification = document.createElement('div');
      notification.textContent = 'Field deleted successfully - fields reordered numerically';
      notification.className = 'fixed top-4 right-4 bg-red-500 text-white px-4 py-2 rounded shadow-lg z-50';
      document.body.appendChild(notification);
      setTimeout(() => document.body.removeChild(notification), 3000);
      
    } catch (error) {
      console.error("Error deleting field:", error);
      alert(`Failed to delete field: ${error.message}`);
    } finally {
      setIsSaving(false);
      savingFieldsRef.current.delete(fieldIndex);
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
        l: 'ssd',
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

  // Track which host “folders” are expanded
  const [expandedHosts, setExpandedHosts] = useState(new Set());

  // Helper: toggle expand/collapse of a host folder
  const toggleHostExpand = (hostId) => {
    console.log(`Toggling host expand for ${hostId}`);
    setExpandedHosts(prev => {
      const next = new Set(prev);
      if (next.has(hostId)) {
        console.log(`Collapsing host ${hostId}`);
        next.delete(hostId);
      } else {
        console.log(`Expanding host ${hostId}`);
        next.add(hostId);
      }
      console.log(`New expandedHosts:`, next);
      return next;
    });
  };

  // Add this function to the SudocEditor component
  const expandHostInCart = async (hostRecord) => {
    console.log("expandHostInCart called with:", hostRecord);
    
    // If already expanded, just collapse
    if (expandedHosts.has(hostRecord.id)) {
      console.log("Host already expanded, collapsing");
      toggleHostExpand(hostRecord.id);
      return;
    }
    
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      
      console.log("Fetching host details for ID:", hostRecord.id);
      // Get full host record with children
      const response = await apiFetch(`/catalog/sudoc/lookup/${hostRecord.id}?include_children=true`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      
      if (!response.ok) throw new Error("Failed to load host details");
      
      const hostData = await response.json();
      console.log("Host data received:", hostData);
      
      if (hostData.childIds?.length > 0) {
        console.log(`Host has ${hostData.childIds.length} children:`, hostData.childIds);
        console.log("Full hostData:", hostData);
        
        // Mark this host as expanded
        toggleHostExpand(hostRecord.id);
        console.log("Host expansion toggled, expandedHosts now:", expandedHosts);
        
        // If we have full child records from the response
        if (hostData.childRecords?.length > 0) {
          console.log("Using child records from response:", hostData.childRecords);
          // Add child records to the main records list if not already there
          setRecords(prevRecords => {
            const childRecords = hostData.childRecords.map(child => ({
              ...child,
              hostId: hostRecord.id,
              _isChildRow: true,  // Add this flag for UI
              // If no ID was found, use the OCLC as display-only
              _isOclcOnly: !child.id && child.oclc
            }));
            
            console.log("Child records being added:", childRecords);
            
            // Filter out any existing children for this host
            const filteredRecords = prevRecords.filter(
              rec => !rec.hostId || rec.hostId !== hostRecord.id
            );
            
            const newRecords = [...filteredRecords, ...childRecords];
            console.log("New records array:", newRecords);
            return newRecords;
          });
        }
        // If we only have IDs, fetch each child
        else {
          const childPromises = hostData.childIds.map(async childId => {
            try {
              const childRes = await apiFetch(`/catalog/sudoc/lookup/${childId}`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
              });
              
              if (childRes.ok) {
                const childData = await childRes.json();
                return {
                  ...childData,
                  hostId: hostRecord.id,
                };
              }
              return null;
            } catch (e) {
              console.error(`Error loading child ${childId}:`, e);
              return null;
            }
          });
          
          const childRecords = await Promise.all(childPromises);
          
          // Add valid child records to the main records list
          setRecords(prevRecords => {
            // Add any children that aren't already in the records list
            const existingIds = new Set(prevRecords.map(r => r.id));
            const newChildren = childRecords
              .filter(c => c && !existingIds.has(c.id));
            
            return [...prevRecords, ...newChildren];
          });
        }
      }
    } catch (error) {
      console.error("Error expanding host:", error);
      alert("Failed to load child records");
    } finally {
      setLoading(false);
    }
  };

  // After backend creates / updates a boundwith set
  const handleBoundwithCreated = ({ host }) => {
    // Do NOT auto-add. Just notify user.
    alert(`Host record #${host.id} created. Use Host Browser to load it.`);
  };

  // Build display list with host "folder" + children
  const buildDisplayRecords = () => {
    const mapById = new Map(records.map(r => [r.id, r]));
    const result = [];
    
    console.log("Building display records from:", records);
    console.log("Expanded hosts:", expandedHosts);
    
    records.forEach(r => {
      // Check if this is a host record
      if (r.isHost || r._isHostRow) {
        console.log(`Adding host record ${r.id}`);
        result.push({ ...r, _isHostRow: true });
        
        // If expanded, show children
        if (expandedHosts.has(r.id)) {
          console.log(`Host ${r.id} is expanded, looking for children`);
          
          // Look for child records in the records array
          const childRecords = records.filter(child => child.hostId === r.id);
          console.log(`Found ${childRecords.length} child records for host ${r.id}:`, childRecords);
          
          childRecords.forEach(child => {
            result.push({ ...child, _isChildRow: true, _hostId: r.id });
          });
        }
      } else if (!r.hostId && !r._isChildRow) {
        // Only add non-host, non-child top-level records here
        console.log(`Adding regular record ${r.id}`);
        result.push(r);
      }
      // Skip child records that aren't being shown under their expanded parent
    });
    
    console.log("Final display records:", result);
    return result;
  };
  const displayRecords = buildDisplayRecords();

  // Explicit loader for host records
  const loadHostFromBrowser = async (hostMeta) => {
    console.log("loadHostFromBrowser called with:", hostMeta);
    try {
      const url = `/catalog/sudoc/${hostMeta.id}`;
      console.log("Fetching host record from:", url);
      
      const res = await apiFetch(url, {
        headers: localStorage.getItem("token") ? { Authorization: `Bearer ${localStorage.getItem("token")}` } : {}
      });
      
      console.log("Host fetch response:", res.status, res.ok);
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error("Host fetch failed:", errorText);
        throw new Error(`Failed to fetch host record: ${res.status} - ${errorText}`);
      }
      
      const fields = await res.json();
      console.log("Host fields loaded:", fields.length);
      
      const hostRecord = {
        id: hostMeta.id,
        title: hostMeta.title,
        sudoc: "",
        oclc: "",
        isHost: true,
        childIds: hostMeta.child_ids || []
      };
      setRecords(prev => {
        // Add host at top; add children ONLY as lightweight stubs
        const next = [hostRecord, ...prev.filter(r => r.id !== hostRecord.id)];
        (hostMeta.child_ids || []).forEach(cid => {
          if (!next.find(r => r.id === cid)) {
            next.push({ id: cid, title: `Child ${cid}`, hostId: hostMeta.id });
          }
        });
        localStorage.setItem("checkedOut", JSON.stringify(next));
        return next;
      });
      setMarcFields(prev => ({ ...prev, [hostMeta.id]: fields }));
      setExpandedHosts(prev => new Set(prev).add(hostMeta.id));
      setSelectedId(hostMeta.id);
      setShowHostBrowser(false);
      console.log("Host loaded successfully, browser closed");
    } catch (e) {
      console.error("Error loading host:", e);
      alert(`Failed to load host: ${e.message}`);
    }
  };

  // Load host children when host is selected
  const loadHostChildren = async (hostId) => {
    try {
      const token = localStorage.getItem("token");
      const resp = await apiFetch(`/catalog/sudoc/boundwith/hosts/${hostId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (resp.ok) {
        const hostInfo = await resp.json();
        // Fetch each child record to get full details
        if (hostInfo.child_ids && hostInfo.child_ids.length > 0) {
          const childDetails = await Promise.all(
            hostInfo.child_ids.map(async (childId) => {
              // Try to find in current records first
              const existingRecord = records.find(r => r.id === childId);
              if (existingRecord) return existingRecord;
              
              // Otherwise fetch from API
              try {
                const childResp = await apiFetch(`/catalog/sudoc/lookup/${childId}`, {
                  headers: { Authorization: `Bearer ${token}` },
                });
                if (childResp.ok) {
                  const data = await childResp.json();
                  return {
                    id: childId,
                    title: data.title || "Untitled Child Record",
                    sudoc: data.sudoc || "",
                    oclc: data.oclc || "",
                    _isChildRow: true,
                    _parentId: hostId
                  };
                }
              } catch (e) {
                console.error(`Error fetching child ${childId}:`, e);
              }
              
              // Fallback with minimal info if fetch fails
              return {
                id: childId,
                title: "Child Record",
                _isChildRow: true,
                _parentId: hostId
              };
            })
          );
          
          // Add child records to the records array
          setExpandedHosts(prev => new Set([...prev, hostId]));
          setRecords(prevRecords => {
            // Find position of host record
            const hostIndex = prevRecords.findIndex(r => r.id === hostId);
            if (hostIndex === -1) return prevRecords;
            
            // Insert children after host
            const newRecords = [...prevRecords];
            newRecords.splice(hostIndex + 1, 0, ...childDetails);
            return newRecords;
          });
        }
      }
    } catch (err) {
      console.error("Error loading host children:", err);
    }
  };

  const toggleHostExpansion = async (hostRecord) => {
    // Toggle expanded state
    const isCurrentlyExpanded = expandedHosts.has(hostRecord.id);
    
    if (isCurrentlyExpanded) {
      // If already expanded, just collapse
      const newExpandedHosts = new Set(expandedHosts);
      newExpandedHosts.delete(hostRecord.id);
      setExpandedHosts(newExpandedHosts);
      return;
    }

    try {
      setLoading(true);
      
      // Fetch host record with its children
      console.log(`Fetching children for host ${hostRecord.id}`);
      const response = await apiFetch(
        `/catalog/sudoc/lookup/${hostRecord.id}?include_children=true`
      );
      
      if (!response.ok) throw new Error("Failed to load host details");
      
      const hostData = await response.json();
      console.log("Host data received:", hostData);
      
      // Mark this host as expanded even if there are no children
      toggleHostExpand(hostRecord.id);
      
      if (hostData.childIds?.length > 0) {
        console.log(`Host has ${hostData.childIds.length} children`);
        
        // If we have full child records from the response
        if (hostData.childRecords && hostData.childRecords.length > 0) {
          console.log(`Got ${hostData.childRecords.length} child record details`);
          
          // Add child records to the main records list
          setRecords(prevRecords => {
            const childRecords = hostData.childRecords.map(child => ({
              ...child,
              hostId: hostRecord.id,
              // If no ID was found, use the OCLC as display-only
              _isOclcOnly: !child.id && child.oclc
            }));
            
            // Filter out any existing children for this host
            const filteredRecords = prevRecords.filter(
              rec => !rec.hostId || rec.hostId !== hostRecord.id
            );
            
            return [...filteredRecords, ...childRecords];
          });
        }
        // If we only have IDs but not full records, create placeholder entries
        else {
          console.log("Child details not included, creating placeholders");
          const childPlaceholders = hostData.childIds.map(childId => ({
            id: childId,
            title: `Child Record ${childId}`,
            sudoc: "Loading...",
            oclc: "",
            hostId: hostRecord.id,
            _isPlaceholder: true
          }));
          
          setRecords(prevRecords => {
            // Filter out any existing children for this host
            const filteredRecords = prevRecords.filter(
              rec => !rec.hostId || rec.hostId !== hostRecord.id
            );
            
            return [...filteredRecords, ...childPlaceholders];
          });
        }
      } else {
        console.log("No children found for this host");
      }
    } catch (error) {
      console.error("Error expanding host record:", error);
      alert(`Failed to load child records: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

const responsiveStyles = `
  .marc-field-container {
    position: relative;
    padding-right: 100px; /* Space for buttons */
    margin-bottom: 8px;
  }
  
  .marc-field-buttons {
    position: absolute;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    gap: 4px;
  }
  
  /* Mobile/laptop styles */
  @media (max-width: 1200px) {
    .marc-field-container {
      padding-right: 0;
      padding-bottom: 40px; /* Space for buttons below on small screens */
    }
    
    .marc-field-buttons {
      top: auto;
      bottom: 4px;
      right: 4px;
      transform: none;
    }
    
    .record-detail-container {
      max-height: 70vh;
      overflow-y: auto;
    }
  }
`;

// Then near the top of your component:
useEffect(() => {
  // Add the styles to the document
  const styleElement = document.createElement('style');
  styleElement.innerHTML = responsiveStyles;
  document.head.appendChild(styleElement);

  return () => {
    document.head.removeChild(styleElement);
  };
}, []);

  return (
    <div className="p-6 space-y-6 bg-gray-100 min-h-screen">
      <CartSelector />
      <div className="mb-4 flex gap-3">
        <button
          onClick={() => setShowHostBrowser(true)}
          className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded shadow text-sm"
        >
          Host Browser
        </button>
      </div>
      
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
            {displayRecords.filter(rec => rec && rec.id).map((rec) => (
              <li
                key={`record-${rec.id}${rec._isChildRow ? '-child' : ''}`}
                className={`relative group ${rec._isChildRow ? 'ml-6' : ''}`}
              >
                <div className="flex items-start gap-2">
                  {rec._isHostRow && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        workingMode === 'cart' ? expandHostInCart(rec) : toggleHostExpand(rec.id);
                      }}
                      className="mt-0.5 text-gray-500 hover:text-gray-700 text-xs px-1 rounded border border-transparent hover:border-gray-300"
                      title={expandedHosts.has(rec.id) ? "Collapse" : "Expand"}
                    >
                      {expandedHosts.has(rec.id) ? '▾' : '▸'}
                    </button>
                  )}
                 <button
                   onClick={() => setSelectedId(rec.id)}
                   className={`w-full text-left p-3 rounded-lg transition duration-150 ${
                     rec.id === selectedId
                       ? "bg-blue-50 text-blue-700 font-medium border border-blue-200"
                       : "hover:bg-gray-50 text-gray-700"
                   }`}
                 >
                   <div className="text-sm leading-tight flex items-center gap-2">
+                    {rec._isHostRow && <span className="px-1.5 py-0.5 bg-yellow-600 text-white rounded text-2xs">HOST</span>}
+                    {rec._isChildRow && <span className="px-1 py-0.5 bg-gray-200 text-gray-600 rounded text-2xs">child</span>}
                     {formatItemDisplay(rec)}
                     {!rec._isHostRow && isBoundwith(rec.id) && (
                      <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">Boundwith</span>
                     )}
                   </div>
                   <div className="text-xs text-gray-500 mt-1">
                     OCLC: {rec.oclc || "—"}
                   </div>
                 </button>
                </div>
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
                  <div className="flex items-center space-x-3">
                    <label className="flex items-center text-sm text-gray-600">
                      <input
                        type="checkbox"
                        checked={autoSaveEnabled}
                        onChange={(e) => setAutoSaveEnabled(e.target.checked)}
                        className="mr-2"
                      />
                      Auto-save
                    </label>
                    <button
                      onClick={() => download([selected.id])}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition duration-150"
                    >
                      Download
                    </button>
                    {selectedCart && workingMode !== 'cart' && (
                      <button
                        onClick={async () => {
                          try {
                            await addToCart(selected.id);
                            alert('Record added to cart successfully!');
                          } catch (err) {
                            alert(`Failed to add to cart: ${err.message}`);
                          }
                        }}
                        className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition duration-150"
                        title={`Add to cart: ${carts.find(c => c.id === selectedCart)?.name || 'Selected Cart'}`}
                      >
                        + Add to Cart
                      </button>
                    )}
                    {selectedCart && workingMode === 'cart' && (
                      <button
                        onClick={async () => {
                          try {
                            await removeFromCart(selected.id);
                            // Remove from local records list
                            setRecords(prev => prev.filter(r => r.id !== selected.id));
                            // Clear selection if this was the selected record
                            if (selectedId === selected.id) {
                              const remaining = records.filter(r => r.id !== selected.id);
                              setSelectedId(remaining[0]?.id || null);
                            }
                            alert('Record removed from cart successfully!');
                          } catch (err) {
                            alert(`Failed to remove from cart: ${err.message}`);
                          }
                        }}
                        className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition duration-150"
                      >
                        Remove from Cart
                      </button>
                    )}
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
                  <div className="px-6 py-4 border-b border-gray-200">
                    <div className="flex justify-between items-center mb-2">
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
                          {Array.isArray(fields) ? (
  fields.map((field, index) => (
    <tr key={`field-${index}-${field.tag}`} className={`hover:bg-gray-50 transition-colors ${
      editedFields[index] && editingField !== index ? 'bg-yellow-50 border-l-4 border-yellow-400' : ''
    } ${editingField === index ? 'bg-blue-50 border-l-4 border-blue-400' : ''}`}>
      {editingField === index ? (
        // Edit Mode content...
        <>
          <td className="px-4 py-3">
            <input
              type="text"
              value={editedFields[index]?.tag || field.tag}
              onChange={e => {
                setEditedFields(prev => ({
                  ...prev,
                  [index]: { ...prev[index] || field, tag: e.target.value }
                }));
                scheduleAutoSave(index);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSaveField(index);
                } else if (e.key === 'Escape') {
                  setEditingField(null);
                  setEditedFields(prev => {
                    const next = { ...prev };
                    delete next[index];
                    return next;
                  });
                }
              }}
              className="w-16 px-2 py-1 border rounded focus:ring-2 focus:ring-blue-500 bg-yellow-50"
              maxLength={3}
            />
          </td>
          <td className="px-4 py-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={editedFields[index]?.ind1 || field.ind1}
                onChange={e => {
                  setEditedFields(prev => ({
                    ...prev,
                    [index]: { ...prev[index] || field, ind1: e.target.value }
                  }));
                  scheduleAutoSave(index);
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSaveField(index);
                  } else if (e.key === 'Escape') {
                    setEditingField(null);
                    setEditedFields(prev => {
                      const next = { ...prev };
                      delete next[index];
                      return next;
                    });
                  }
                }}

                className="w-8 px-2 py-1 border rounded focus:ring-2 focus:ring-blue-500 bg-yellow-50"
                maxLength={1}
              />
              <input
                type="text"
                value={editedFields[index]?.ind2 || field.ind2}
                onChange={e => {
                  setEditedFields(prev => ({
                    ...prev,
                    [index]: { ...prev[index] || field, ind2: e.target.value }
                  }));
                  scheduleAutoSave(index);
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSaveField(index);
                  } else if (e.key === 'Escape') {
                    setEditingField(null);
                    setEditedFields(prev => {
                      const next = { ...prev };
                      delete next[index];
                      return next;
                    });
                  }
                }}

                className="w-8 px-2 py-1 border rounded focus:ring-2 focus:ring-blue-500 bg-yellow-50"
                maxLength={1}
              />
            </div>
          </td>
          <td className="px-4 py-3">
            <input
              type="text"
              value={Object.entries(editedFields[index]?.subfields || field.subfields || {})
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
                scheduleAutoSave(index);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSaveField(index);
                } else if (e.key === 'Escape') {
                  setEditingField(null);
                  setEditedFields(prev => {
                    const next = { ...prev };
                    delete next[index];
                    return next;
                  });
                }
              }}

              className="w-full px-2 py-1 border rounded focus:ring-2 focus:ring-blue-500 font-mono bg-yellow-50"
              placeholder="$a Title $b Subtitle..."
            />
          </td>
          <td className="px-4 py-3 text-right">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 italic">
                {isSaving ? (
                  <span className="text-blue-600">Saving...</span>
                ) : isTyping ? (
                  <span className="text-orange-500">Typing...</span>
                ) : !autoSaveEnabled ? (
                  <span className="text-red-500">Auto-save disabled</span>
                ) : autoSaveTimeoutRef.current ? (
                  <span className="text-yellow-600">Auto-save pending</span>
                ) : (
                  'Enter: Save • Esc: Cancel'
                )}
              </span>
              <button
                onClick={() => handleSaveField(index)}
                disabled={isSaving}
                className="px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 text-sm"
                title="Save (Enter)"
              >
                ✓
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
                className="px-2 py-1 text-gray-600 hover:text-gray-800 text-sm"
                title="Cancel (Esc)"
              >
                ✕
              </button>
              <button
                onClick={() => handleDeleteField(index)}
                disabled={isSaving}
                className="px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 text-sm"
                title="Delete field"
              >
                🗑️
              </button>
            </div>
          </td>
        </>
      ) : (
        // View Mode content...
        <>
          <td className="px-4 py-3 font-mono">{field.tag}</td>
          <td className="px-4 py-3 font-mono">{field.ind1}{field.ind2}</td>
          <td className="px-4 py-3 font-mono">
            {field.subfields && Object.entries(field.subfields)
              .map(([code, val]) => (
                <span key={`subfield-${code}`} className="mr-2">
                  <span className="text-blue-600">${code}</span> {val}
                </span>
              ))}
          </td>
          <td className="px-4 py-3 text-right">
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => setEditingField(index)}
                className="text-blue-600 hover:text-blue-800 text-sm"
              >
                Edit
              </button>
              <button
                onClick={() => handleDeleteField(index)}
                className="text-red-600 hover:text-red-800 text-sm"
                title="Delete field"
              >
                Delete
              </button>
            </div>
          </td>
        </>
      )}
    </tr>
  ))
) : (
  <tr>
    <td colSpan={4} className="p-4 text-center text-gray-500">No fields available</td>
  </tr>
)}
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
                  Description ($n)
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
            onBoundwithCreated={handleBoundwithCreated}
        />
      )}

      {/* Created Hosts Modal */}
      {showCreatedHosts && (
        <CreatedHostsModal
          isOpen={showCreatedHosts}
          onClose={() => setShowCreatedHosts(false)}
          onLoadHost={loadHost}
        />
      )}

      {/* Host Browser Modal */}
      {showHostBrowser && (
        <HostBrowserModal
          isOpen={showHostBrowser}
          onClose={() => setShowHostBrowser(false)}
          onLoadHost={loadHostFromBrowser}
          carts={carts}
          selectedCart={selectedCart}
          loadCarts={loadCarts}
        />
      )}
    </div>
  );
}

export default SudocEditor;
