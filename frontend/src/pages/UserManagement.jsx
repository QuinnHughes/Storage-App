import React, { useState, useEffect } from 'react';
import axios from 'axios';

// Set API base URL; default to '/api' so that '/api/users' is proxied to FastAPI
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
});

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({ username: '', password: '', role: 'viewer' });

  // Attach auth header on mount
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/api/users/list');
      setUsers(response.data);
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenForm = (user = null) => {
    setEditingUser(user);
    setFormData({
      username: user?.username || '',
      password: '',
      role: user?.role || 'viewer',
    });
    setError('');
    setShowForm(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editingUser) {
        await api.patch(`/api/users/modify/${editingUser.id}`, formData);
      } else {
        await api.post('/api/users/create', formData);
      }
      setShowForm(false);
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this user?')) return;
    setError('');
    try {
      await api.delete(`/api/users/remove/${id}`);
      setUsers((prev) => prev.filter((u) => u.id !== id));
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    }
  };

  return (
    <div className="max-w-100% mx-auto p-8">
      <h2 className="text-2xl font-semibold mb-6">User Management</h2>
      {error && <div className="text-red-600 mb-4">{error}</div>}
      <button
        onClick={() => handleOpenForm()}
        className="mb-4 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition"
      >
        Add User
      </button>
      {loading ? (
        <div>Loading...</div>
      ) : (
        <table className="w-full table-auto bg-white shadow rounded">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left">ID</th>
              <th className="px-4 py-2 text-left">Username</th>
              <th className="px-4 py-2 text-left">Role</th>
              <th className="px-4 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u, idx) => (
              <tr key={u.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-4 py-2">{u.id}</td>
                <td className="px-4 py-2">{u.username}</td>
                <td className="px-4 py-2">{u.role}</td>
                <td className="px-4 py-2 space-x-2">
                  <button onClick={() => handleOpenForm(u)} className="text-indigo-600 hover:underline">Edit</button>
                  <button onClick={() => handleDelete(u.id)} className="text-red-600 hover:underline">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <form onSubmit={handleSave} className="bg-white p-6 rounded shadow-lg w-80">
            <h3 className="text-xl mb-4">{editingUser ? 'Edit User' : 'Add User'}</h3>
            <label className="block mb-2">Username</label>
            <input
              type="text"
              className="w-full border px-2 py-1 mb-4"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              required
            />
            <label className="block mb-2">Password {editingUser && '(leave blank to keep)'}</label>
            <input
              type="password"
              className="w-full border px-2 py-1 mb-4"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              {...(!editingUser && { required: true })}
            />
            <label className="block mb-2">Role</label>
            <select
              className="w-full border px-2 py-1 mb-4"
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
            >
              <option value="viewer">viewer</option>
              <option value="book_worm">book_worm</option>
              <option value="cataloger">cataloger</option>
              <option value="admin">admin</option>
            </select>
            <div className="flex justify-end space-x-2">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2">Cancel</button>
              <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition">Save</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
