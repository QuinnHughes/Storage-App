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
import CreateRecords from "./pages/CreateRecords";
import ManageRecords from "./pages/ManageRecords"
import CombinedUpload from "./pages/CombinedUpload";
import SudocRecords from "./pages/SudocRecords";
import Documentation from "./pages/Documentation";
import SudocEditor from "./pages/SudocEditor";
import AccessionSlots from "./pages/AccessionSlots"
import UserManagement from "./pages/UserManagement"
import UserLogs from "./pages/UserLogs";


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
          <Route path="accession-slots" element={<AccessionSlots />} />
          <Route path="item-search" element={<ItemSearch />} />
          <Route path="analytics-search" element={<AnalyticsSearch />} />
          <Route path="analytics-errors" element={<AnalyticsErrors />} />
          <Route path="create-records" element={<CreateRecords />} />
          <Route path="manage-records" element={<ManageRecords />} />
          <Route path="combined-upload" element={<CombinedUpload />} />
          <Route path="user-logs" element={<UserLogs />} />
          <Route path="documentation" element={<Documentation />} /> 
          <Route path="user-management" element={<UserManagement />} />
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
