// src/App.jsx

import "./index.css";

import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate
} from "react-router-dom";

import Layout           from "./components/Layout";
import Login            from "./pages/Login";
import QuickStart       from "./pages/QuickStart";
import EmptySlots       from "./pages/EmptySlots";
import ItemSearch       from "./pages/ItemSearch";
import AnalyticsSearch  from "./pages/AnalyticsSearch";
import AnalyticsErrors  from "./pages/AnalyticsErrors";
import ItemManager      from "./pages/ItemManager";
import UploadItems      from "./pages/UploadItems";
import UploadAnalytics  from "./pages/UploadAnalytics";
import ReviewNeeded     from "./pages/ReviewNeeded";
import AdminEdit        from "./pages/AdminEdit";
import Documentation    from "./pages/Documentation";

// A simple guard: if token exists, render children; otherwise redirect to /login
function PrivateRoute({ children }) {
  const token = localStorage.getItem("token");
  return token ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Router>
      <Routes>

        {/* Public login page */}
        <Route path="/login" element={<Login />} />

        {/* Everything under "/" is protected */}
        <Route
          path="/"
          element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }
        >
          <Route index element={<QuickStart />} />
          <Route path="empty-slots"      element={<EmptySlots />} />
          <Route path="item-search"      element={<ItemSearch />} />
          <Route path="analytics-search" element={<AnalyticsSearch />} />
          <Route path="analytics-errors" element={<AnalyticsErrors />} />
          <Route path="item-manager"     element={<ItemManager />} />
          <Route path="upload-items"     element={<UploadItems />} />
          <Route path="upload-analytics" element={<UploadAnalytics />} />
          <Route path="review-needed"    element={<ReviewNeeded />} />
          <Route path="admin-edit"       element={<AdminEdit />} />
          <Route path="documentation"    element={<Documentation />} />
        </Route>

        {/* Fallback: send unknown URLs to home (or change as you like) */}
        <Route path="*" element={<Navigate to="/" replace />} />

      </Routes>
    </Router>
  );
}
