import { useState } from "react";

// CombinedUpload: Page for uploading analytics, items, and weeded items
// Descriptions are set in code below and displayed as static text
export default function CombinedUpload() {
  const [analyticsFile, setAnalyticsFile] = useState(null);
  const [itemsFile, setItemsFile] = useState(null);
  const [weedFile, setWeedFile] = useState(null);

  const [feedback, setFeedback] = useState({ analytics: null, items: null, weed: null });

  // Static descriptions - update these in the code to change the text
  const descriptions = {
    analytics: "Upload Analytics excel files from oracle analytics here, for information on how to retrieve analytics for here see documentation.",
    items: "Upload Item files here for whats currently on the shelves. NOTICE read the full description in documentation before uploading anything here and make sure you have a complete understanding. This is one of the more simple tools but consider this a warning a mistake here will cause hours of work for someone else and will cause innacuracys in nearly the entire app.",
    weed: "Upload a weeded items excel file. In documentation is a sample for how to edit a completed weeding list to upload. ",
  };

  const handleFileChange = (setter) => (e) => {
    setter(e.target.files[0]);
    setFeedback({ analytics: null, items: null, weed: null });
  };

  const handleUpload = async (type) => {
    let file;
    let endpoint;

    if (type === "analytics") {
      file = analyticsFile;
      endpoint = "/upload/analytics-file";
    } else if (type === "items") {
      file = itemsFile;
      endpoint = "/upload/items-file";
    } else if (type === "weed") {
      file = weedFile;
      endpoint = "/weed/weed/upload";
    }

    if (!file) {
      setFeedback((prev) => ({ ...prev, [type]: { error: "Please select a file first." } }));
      return;
    }

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
          />
          {analyticsFile ? (
            <span className="text-gray-800 font-medium">Selected file: {analyticsFile.name}</span>
          ) : (
            <span className="text-gray-500">Click or drag to select analytics file</span>
          )}
        </div>
        <button
          onClick={() => handleUpload("analytics")}
          className="w-full mt-2 py-2 bg-green-600 text-white font-medium rounded hover:bg-green-700"
        >
          Upload Analytics
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
