import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import apiFetch from '../api/client';
import './QuickStart.css';

const QuickStart = () => {
  const [stats, setStats] = useState({
    totalItems: 0,
    totalAnalytics: 0,
    analyticsErrors: 0,
    emptySlots: 0,
    loading: true
  });
  const [userRole, setUserRole] = useState('viewer');

  useEffect(() => {
    const fetchOverviewData = async () => {
      try {
        const token = localStorage.getItem("token");
        
        // Get user role from token payload
        if (token) {
          const payload = JSON.parse(atob(token.split('.')[1]));
          setUserRole(payload.role || 'viewer');
        }

        const headers = { Authorization: `Bearer ${token}` };

        // Fetch dashboard statistics
        try {
          const dashboardRes = await apiFetch("/dashboard/stats", { headers });
          
          if (dashboardRes.ok) {
            const dashboardData = await dashboardRes.json();
            
            setStats({
              totalItems: dashboardData.totals.items || 0,
              totalAnalytics: dashboardData.totals.analytics || 0,
              analyticsErrors: dashboardData.totals.analytics_errors || 0,
              emptySlots: dashboardData.totals.empty_slots || 0,
              loading: false
            });
          } else {
            console.error('Dashboard API failed:', dashboardRes.status);
            setStats(prev => ({ ...prev, loading: false }));
          }
        } catch (err) {
          console.error('Error fetching dashboard stats:', err);
          setStats(prev => ({ ...prev, loading: false }));
        }

      } catch (error) {
        console.error('Error fetching overview data:', error);
        setStats(prev => ({ ...prev, loading: false }));
      }
    };

    fetchOverviewData();
  }, []);

  const StatCard = ({ title, value, description, icon, link, color = "blue" }) => (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow duration-200`}>
      <div className="flex items-center">
        <div className={`flex-shrink-0 p-3 rounded-lg bg-${color}-100`}>
          <div className={`w-6 h-6 text-${color}-600`}>
            {icon}
          </div>
        </div>
        <div className="ml-4 flex-1">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            {link && (
              <Link
                to={link}
                className={`text-${color}-600 hover:text-${color}-700 text-sm font-medium`}
              >
                View →
              </Link>
            )}
          </div>
          <div className="mt-1">
            <div className="text-2xl font-bold text-gray-900">
              {stats.loading ? (
                <div className="animate-pulse bg-gray-200 h-8 w-16 rounded"></div>
              ) : (
                value.toLocaleString()
              )}
            </div>
            <p className="text-sm text-gray-600 mt-1">{description}</p>
          </div>
        </div>
      </div>
    </div>
  );

  const QuickActionCard = ({ title, description, link, icon, requiredRole, color = "indigo" }) => {
    const hasAccess = 
      requiredRole === 'viewer' || 
      (requiredRole === 'book_worm' && ['book_worm', 'cataloger', 'admin'].includes(userRole)) ||
      (requiredRole === 'cataloger' && ['cataloger', 'admin'].includes(userRole)) ||
      (requiredRole === 'admin' && userRole === 'admin');

    return (
      <Link
        to={link}
        className={`block p-6 bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-all duration-200 ${
          hasAccess ? 'hover:border-' + color + '-300' : 'opacity-50 cursor-not-allowed'
        }`}
        onClick={(e) => !hasAccess && e.preventDefault()}
      >
        <div className="flex items-start">
          <div className={`flex-shrink-0 p-2 rounded-lg bg-${color}-100`}>
            <div className={`w-5 h-5 text-${color}-600`}>
              {icon}
            </div>
          </div>
          <div className="ml-4 flex-1">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
            <p className="text-gray-600 text-sm mb-3">{description}</p>
            <div className="flex items-center justify-between">
              <span className={`text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600`}>
                {requiredRole}+ access
              </span>
              {hasAccess && (
                <span className={`text-${color}-600 text-sm font-medium`}>
                  Open →
                </span>
              )}
            </div>
          </div>
        </div>
      </Link>
    );
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Storage App Dashboard</h1>
        <p className="text-xl text-gray-600 max-w-3xl mx-auto">
          Comprehensive management system for physical storage and MARC cataloging of government document collections
        </p>
        <div className="mt-4 inline-flex items-center px-4 py-2 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
          Logged in as: <span className="ml-1 capitalize font-semibold">{userRole}</span>
        </div>
      </div>

      {/* Statistics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Items"
          value={stats.totalItems}
          description="Physical items in storage"
          icon={<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>}
          link="/item-search"
          color="blue"
        />
        
        <StatCard
          title="Analytics Records"
          value={stats.totalAnalytics}
          description="ILS system integrations"
          icon={<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
          link="/analytics-search"
          color="green"
        />
        
        <StatCard
          title="Analytics Errors"
          value={stats.analyticsErrors}
          description="Records needing attention"
          icon={<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>}
          link="/analytics-errors"
          color="red"
        />
        
        <StatCard
          title="Empty Slots"
          value={stats.emptySlots}
          description="Available storage positions"
          icon={<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>}
          link="/empty-slots"
          color="purple"
        />
      </div>

      {/* Quick Actions */}
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-gray-900">Quick Actions</h2>
        
        {/* Search & Discovery */}
        <div>
          <h3 className="text-lg font-semibold text-gray-700 mb-4">🔍 Search & Discovery</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <QuickActionCard
              title="Item Search"
              description="Find physical items by barcode, location, or call number"
              link="/item-search"
              requiredRole="viewer"
              icon={<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>}
              color="blue"
            />
            
            <QuickActionCard
              title="Analytics Search"
              description="Search ILS analytics data and integration records"
              link="/analytics-search"
              requiredRole="viewer"
              icon={<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
              color="green"
            />
            
            <QuickActionCard
              title="Empty Slots"
              description="Find available storage positions for new items"
              link="/empty-slots"
              requiredRole="viewer"
              icon={<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>}
              color="purple"
            />
          </div>
        </div>

        {/* Storage Management */}
        <div>
          <h3 className="text-lg font-semibold text-gray-700 mb-4">📦 Storage Management</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <QuickActionCard
              title="Accession from Slots"
              description="Process new items into available storage positions"
              link="/accession-slots"
              requiredRole="book_worm"
              icon={<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>}
              color="green"
            />
            
            <QuickActionCard
              title="Analytics Errors"
              description="Review and resolve analytics discrepancies"
              link="/analytics-errors"
              requiredRole="viewer"
              icon={<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>}
              color="red"
            />
            
            <QuickActionCard
              title="Upload Files"
              description="Bulk upload Excel files for items and analytics"
              link="/combined-upload"
              requiredRole="book_worm"
              icon={<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>}
              color="indigo"
            />
          </div>
        </div>

        {/* Cataloging & Records */}
        <div>
          <h3 className="text-lg font-semibold text-gray-700 mb-4">📚 Cataloging & Records</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <QuickActionCard
              title="SuDoc Records"
              description="Browse and manage MARC catalog records"
              link="/sudoc-records"
              requiredRole="cataloger"
              icon={<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
              color="yellow"
            />
            
            <QuickActionCard
              title="SuDoc Editor"
              description="Edit MARC records and create new catalog entries"
              link="/sudoc-editor"
              requiredRole="cataloger"
              icon={<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>}
              color="orange"
            />
            
            <QuickActionCard
              title="Manage Records"
              description="Manage item records (weeded items, Alma analytics, items)"
              link="/manage-records"
              requiredRole="cataloger"
              icon={<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" /></svg>}
              color="teal"
            />
          </div>
        </div>

        {/* Admin Tools */}
        {['admin', 'cataloger'].includes(userRole) && (
          <div>
            <h3 className="text-lg font-semibold text-gray-700 mb-4">⚙️ Administration</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <QuickActionCard
                title="User Management"
                description="Manage user accounts and permissions"
                link="/user-management"
                requiredRole="admin"
                icon={<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" /></svg>}
                color="red"
              />
              
              <QuickActionCard
                title="User Logs"
                description="View system activity and audit trails"
                link="/user-logs"
                requiredRole="admin"
                icon={<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
                color="gray"
              />
              
              <QuickActionCard
                title="Documentation"
                description="Comprehensive system documentation and guides"
                link="/documentation"
                requiredRole="viewer"
                icon={<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>}
                color="blue"
              />
            </div>
          </div>
        )}
      </div>

      {/* System Info */}
      <div className="bg-gray-50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">📋 System Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-gray-600">
          <div>
            <h4 className="font-semibold text-gray-700 mb-2">Storage Format</h4>
            <code className="bg-white px-2 py-1 rounded text-xs">S-{`{floor}`}-{`{range}`}-{`{ladder}`}-{`{shelf}`}-{`{position}`}</code>
            <p className="mt-1">Example: S-A-01B-02-03-001</p>
          </div>
          <div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuickStart;

