// src/App.jsx

// 1) Import Tailwind’s generated CSS first:
import "./index.css";

import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import QuickStart from "./pages/QuickStart";
import ItemSearch from "./pages/ItemSearch";
import EmptySlots from "./pages/EmptySlots";
import ItemManager from "./pages/ItemManager";
import AnalyticsSearch from "./pages/AnalyticsSearch";
import UploadItems from "./pages/UploadItems";
import UploadAnalytics from "./pages/UploadAnalytics";
import ReviewNeeded from "./pages/ReviewNeeded";
import AdminEdit from "./pages/AdminEdit";
import AnalyticsErrors from "./pages/AnalyticsErrors";
import Documentation from "./pages/Documentation";

const App = () => (
  <Router>
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<QuickStart />} />
        <Route path="empty-slots" element={<EmptySlots />} />
        <Route path="item-search" element={<ItemSearch />} />
        <Route path="analytics-search" element={<AnalyticsSearch />} />
        <Route path="analytics-errors" element={<AnalyticsErrors />} />
        <Route path="item-manager" element={<ItemManager />} />
        <Route path="upload-items" element={<UploadItems />} />
        <Route path="upload-analytics" element={<UploadAnalytics />} />
        <Route path="review-needed" element={<ReviewNeeded />} />
        <Route path="admin-edit" element={<AdminEdit />} />
        <Route path="documentation" element={<Documentation />} />
      </Route>
    </Routes>
  </Router>
);

export default App;
