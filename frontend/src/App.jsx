// src/App.jsx
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import ShelfViewer from './pages/ShelfViewer';
import ItemManager from './pages/ItemManager';
import AnalyticsManager from './pages/AnalyticsManager';
import Search from './pages/Search';
import Compare from './pages/Compare';
import ReviewNeeded from './pages/ReviewNeeded';
import AdminEdit from './pages/AdminEdit';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="shelf-viewer" element={<ShelfViewer />} />
          <Route path="item-manager" element={<ItemManager />} />
          <Route path="analytics-manager" element={<AnalyticsManager />} />
          <Route path="search" element={<Search />} />
          <Route path="compare" element={<Compare />} />
          <Route path="review-needed" element={<ReviewNeeded />} />
          <Route path="admin/edit" element={<AdminEdit />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Router>
  );
}
