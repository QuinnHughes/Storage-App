import "./index.css";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";

import ProtectedRoute from "./components/ProtectedRoute";

import Layout from "./components/Layout";
import Login from "./pages/Login";
import QuickStart from "./pages/QuickStart";
import EmptySlots from "./pages/EmptySlots";
import ItemSearch from "./pages/ItemSearch";
import AnalyticsSearch from "./pages/AnalyticsSearch";
import AnalyticsErrors from "./pages/AnalyticsErrors";
import CreateItems from "./pages/CreateItems";
import CombinedUpload from "./pages/CombinedUpload";
import ReviewNeeded from "./pages/ReviewNeeded";
import SudocRecords from "./pages/SudocRecords";
import Documentation from "./pages/Documentation";
import SudocEditor from "./pages/SudocEditor";

export default function App() {
  return (
    <Router>
      <Routes>
        {/* ✅ public login route */}
        <Route path="/login" element={<Login />} />

        {/* ✅ protected routes */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<QuickStart />} />
          <Route path="empty-slots" element={<EmptySlots />} />
          <Route path="item-search" element={<ItemSearch />} />
          <Route path="analytics-search" element={<AnalyticsSearch />} />
          <Route path="analytics-errors" element={<AnalyticsErrors />} />
          <Route path="create-items" element={<CreateItems />} />
          <Route path="combined-upload" element={<CombinedUpload />} />
          <Route path="review-needed" element={<ReviewNeeded />} />
          <Route path="documentation" element={<Documentation />} />
          <Route path="sudoc-records" element={<SudocRecords />} />
          {/* Editor handles both listing and incoming record_id param */}
          <Route path="sudoc-editor" element={<SudocEditor />} />
          <Route path="sudoc-editor/:record_id" element={<SudocEditor />} />
        </Route>

        {/* ✅ fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
