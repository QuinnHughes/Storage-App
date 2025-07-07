import { useState } from "react";

export default function UploadItems() {
  const [file, setFile] = useState(null);
  const [feedback, setFeedback] = useState(null);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setFeedback(null);
  };

  const handleUpload = async () => {
    if (!file) {
      setFeedback({ error: "Please select a file first." });
      return;
    }
    const form = new FormData();
    form.append("file", file);

        try {
      const token = localStorage.getItem('token');
      const resp = await fetch("/upload/items-file", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: form,
      });

      // Read raw text once
      const text = await resp.text();

      if (resp.ok) {
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          data = { message: text };
        }
        setFeedback(data);
      } else {
        let err;
        try {
          err = JSON.parse(text);
        } catch {
          err = text || `HTTP ${resp.status}: ${resp.statusText}`;
        }
        setFeedback({ error: err });
      }
    } catch (e) {
      setFeedback({ error: "Network error: " + e.message });
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <h3 className="text-xl font-semibold">Upload Items</h3>
      <input type="file" accept=".xlsx,.xls" onChange={handleFileChange} />
      <button
        onClick={handleUpload}
        className="mt-2 px-4 py-2 bg-blue-600 text-white rounded"
      >
        Upload
      </button>

      {feedback && (
        <pre className="mt-4 bg-gray-100 p-4 rounded text-sm overflow-x-auto">
          {JSON.stringify(feedback, null, 2)}
        </pre>
      )}
    </div>
  );
}
