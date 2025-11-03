import { useState } from "react";
import apiFetch from '../api/client';

// CombinedUpload: Page for uploading analytics, items, and weeded items
// Descriptions are set in code below and displayed as static text
export default function CombinedUpload() {
  const [analyticsFile, setAnalyticsFile] = useState(null);
  const [itemsFile, setItemsFile] = useState(null);
  const [weedFile, setWeedFile] = useState(null);

  const [feedback, setFeedback] = useState({ analytics: null, items: null, weed: null });
  const [analyticsProgress, setAnalyticsProgress] = useState(null);
  const [isUploading, setIsUploading] = useState({ analytics: false, items: false, weed: false });

  // Static descriptions - update these in the code to change the text
  const descriptions = {
    analytics: "Upload Analytics excel files from oracle analytics here, for information on how to retrieve analytics for here see documentation.",
    items: "Upload Item files here for whats currently on the shelves. NOTICE read the full description in documentation before uploading anything here.",
    weed: "Upload a weeded items excel file. In documentation is a sample for how to edit a completed weeding list to upload. ",
  };

  const handleFileChange = (setter) => (e) => {
    setter(e.target.files[0]);
    setFeedback({ analytics: null, items: null, weed: null });
    setAnalyticsProgress(null);
  };

  const handleAnalyticsUploadStream = async () => {
    if (!analyticsFile) {
      setFeedback((prev) => ({ ...prev, analytics: { error: "Please select a file first." } }));
      return;
    }

    setIsUploading((prev) => ({ ...prev, analytics: true }));
    setAnalyticsProgress({ progress: 0, processed: 0, total: 0 });
    setFeedback((prev) => ({ ...prev, analytics: null }));

    const form = new FormData();
    form.append("file", analyticsFile);

    try {
      const token = localStorage.getItem("token");
      const resp = await fetch("/api/upload/analytics-file", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.trim()) {
            try {
              const data = JSON.parse(line);
              
              if (data.error) {
                setFeedback((prev) => ({ ...prev, analytics: { error: data.error } }));
                setIsUploading((prev) => ({ ...prev, analytics: false }));
                setAnalyticsProgress(null);
                return;
              }

              if (data.status === "processing") {
                setAnalyticsProgress({
                  progress: data.progress || 0,
                  processed: data.processed || 0,
                  total: data.total || 0,
                  inserted: data.inserted || 0,
                  errors_inserted: data.errors_inserted || 0,
                  skipped_out_of_range: data.skipped_out_of_range || 0
                });
              } else if (data.status === "complete") {
                setFeedback((prev) => ({ ...prev, analytics: data }));
                setAnalyticsProgress(null);
                setIsUploading((prev) => ({ ...prev, analytics: false }));
              }
            } catch (e) {
              console.error("Failed to parse progress line:", line, e);
            }
          }
        }
      }
    } catch (e) {
      setFeedback((prev) => ({ ...prev, analytics: { error: "Network error: " + e.message } }));
      setIsUploading((prev) => ({ ...prev, analytics: false }));
      setAnalyticsProgress(null);
    }
  };

  const handleUpload = async (type) => {
    // Special handling for analytics with streaming progress
    if (type === "analytics") {
      return handleAnalyticsUploadStream();
    }

    let file;
    let endpoint;

    if (type === "items") {
      file = itemsFile;
      endpoint = "/api/upload/items-file";
    } else if (type === "weed") {
      file = weedFile;
      endpoint = "/api/weed/upload";
    }

    if (!file) {
      setFeedback((prev) => ({ ...prev, [type]: { error: "Please select a file first." } }));
      return;
    }

    setIsUploading((prev) => ({ ...prev, [type]: true }));

    const form = new FormData();
    form.append("file", file);

    try {
      const token = localStorage.getItem("token");
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });

      const text = await resp.text();
      if (resp.ok) {
        let data;
        try { data = JSON.parse(text); } catch { data = { message: text }; }
        setFeedback((prev) => ({ ...prev, [type]: data }));
      } else {
        let err;
        try { err = JSON.parse(text); } catch { err = text || `HTTP ${resp.status}: ${resp.statusText}`; }
        setFeedback((prev) => ({ ...prev, [type]: { error: err } }));
      }
    } catch (e) {
      setFeedback((prev) => ({ ...prev, [type]: { error: "Network error: " + e.message } }));
    } finally {
      setIsUploading((prev) => ({ ...prev, [type]: false }));
    }
  };

  return (
    <div className="max-w-100% mx-auto space-y-10 p-6 bg-gray-50 rounded-lg shadow">
      <h2 className="text-3xl font-bold text-center">Combined Upload</h2>

      {/* Analytics Upload Section */}
      <section className="p-6 bg-white rounded-lg shadow-lg space-y-4">
        <h3 className="text-2xl font-semibold">Analytics Upload</h3>
        <p className="text-gray-700">{descriptions.analytics}</p>
        <div className="relative border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400">
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileChange(setAnalyticsFile)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            disabled={isUploading.analytics}
          />
          {analyticsFile ? (
            <span className="text-gray-800 font-medium">Selected file: {analyticsFile.name}</span>
          ) : (
            <span className="text-gray-500">Click or drag to select analytics file</span>
          )}
        </div>
        
        {analyticsProgress && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Processing: {analyticsProgress.processed} / {analyticsProgress.total} rows</span>
              <span>{analyticsProgress.progress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
              <div 
                className="bg-green-600 h-4 rounded-full transition-all duration-300 ease-out flex items-center justify-center text-xs text-white font-medium"
                style={{ width: `${analyticsProgress.progress}%` }}
              >
                {analyticsProgress.progress > 10 && `${analyticsProgress.progress}%`}
              </div>
            </div>
            <div className="flex justify-between text-xs text-gray-500">
              <span>Inserted: {analyticsProgress.inserted || 0}</span>
              <span>Errors: {analyticsProgress.errors_inserted || 0}</span>
              <span>Out of Range: {analyticsProgress.skipped_out_of_range || 0}</span>
            </div>
          </div>
        )}

        <button
          onClick={() => handleUpload("analytics")}
          disabled={isUploading.analytics}
          className={`w-full mt-2 py-2 font-medium rounded ${
            isUploading.analytics 
              ? 'bg-gray-400 cursor-not-allowed' 
              : 'bg-green-600 text-white hover:bg-green-700'
          }`}
        >
          {isUploading.analytics ? 'Uploading...' : 'Upload Analytics'}
        </button>
        {feedback.analytics && (
          <pre className="mt-3 bg-gray-100 p-3 rounded text-sm overflow-x-auto">
            {JSON.stringify(feedback.analytics, null, 2)}
          </pre>
        )}
      </section>

      {/* Items Upload Section */}
      <section className="p-6 bg-white rounded-lg shadow-lg space-y-4">
        <h3 className="text-2xl font-semibold">Items Upload</h3>
        <p className="text-gray-700">{descriptions.items}</p>
        <div className="relative border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400">
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileChange(setItemsFile)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          {itemsFile ? (
            <span className="text-gray-800 font-medium">Selected file: {itemsFile.name}</span>
          ) : (
            <span className="text-gray-500">Click or drag to select items file</span>
          )}
        </div>
        <button
          onClick={() => handleUpload("items")}
          className="w-full mt-2 py-2 bg-blue-600 text-white font-medium rounded hover:bg-blue-700"
        >
          Upload Items
        </button>
        {feedback.items && (
          <pre className="mt-3 bg-gray-100 p-3 rounded text-sm overflow-x-auto">
            {JSON.stringify(feedback.items, null, 2)}
          </pre>
        )}
      </section>

      {/* Weeded Items Upload Section */}
      <section className="p-6 bg-white rounded-lg shadow-lg space-y-4">
        <h3 className="text-2xl font-semibold">Weeded Items Upload</h3>
        <p className="text-gray-700">{descriptions.weed}</p>
        <div className="relative border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400">
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileChange(setWeedFile)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          {weedFile ? (
            <span className="text-gray-800 font-medium">Selected file: {weedFile.name}</span>
          ) : (
            <span className="text-gray-500">Click or drag to select weeded items file</span>
          )}
        </div>
        <button
          onClick={() => handleUpload("weed")}
          className="w-full mt-2 py-2 bg-purple-600 text-white font-medium rounded hover:bg-purple-700"
        >
          Upload Weeded Items
        </button>
        {feedback.weed && (
          <pre className="mt-3 bg-gray-100 p-3 rounded text-sm overflow-x-auto">
            {JSON.stringify(feedback.weed, null, 2)}
          </pre>
        )}
      </section>
    </div>
  );
}
