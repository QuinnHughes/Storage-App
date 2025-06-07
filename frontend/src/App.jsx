// src/App.jsx

// 1) Import Tailwind’s generated CSS first:
import "./index.css";

import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import QuickStart from "./pages/QuickStart";
import ItemSearch from "./pages/ItemSearch";
import ShelfViewer from "./pages/ShelfViewer";
import ItemManager from "./pages/ItemManager";
import AnalyticsSearch from "./pages/AnalyticsSearch";
import UploadItems from "./pages/UploadItems";
import UploadAnalytics from "./pages/UploadAnalytics";
import ReviewNeeded from "./pages/ReviewNeeded";
import AdminEdit from "./pages/AdminEdit";
import Compare from "./pages/Compare";

const App = () => (
  <Router>
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<QuickStart />} />
        <Route path="shelf-viewer" element={<ShelfViewer />} />
        <Route path="item-search" element={<ItemSearch />} />
        <Route path="analytics-search" element={<AnalyticsSearch />} />
        <Route path="compare" element={<Compare />} />
        <Route path="item-manager" element={<ItemManager />} />
        <Route path="upload-items" element={<UploadItems />} />
        <Route path="upload-analytics" element={<UploadAnalytics />} />
        <Route path="review-needed" element={<ReviewNeeded />} />
        <Route path="admin-edit" element={<AdminEdit />} />
      </Route>
    </Routes>
  </Router>
);

export default App;
