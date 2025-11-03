import { useState, useEffect } from 'react';
import apiFetch from '../api/client';

export function useSudocCarts() {
  const [carts, setCarts] = useState([]);
  const [selectedCart, setSelectedCart] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load carts on mount
  useEffect(() => {
    loadCarts();
  }, []);

  const loadCarts = async () => {
    try {
      console.log('Loading carts...');
      const res = await apiFetch('/catalog/sudoc/cart');
      if (!res.ok) {
        throw new Error('Failed to load carts');
      }
      const data = await res.json();
      console.log('Loaded carts:', data);
      setCarts(data);
      // Select first cart if none selected
      if (!selectedCart && data.length > 0) {
        setSelectedCart(data[0].id);
      }
    } catch (err) {
      console.error('Error loading carts:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const createCart = async (name) => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiFetch('/catalog/sudoc/cart', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({ name })
      });
      
      if (!res.ok) throw new Error('Failed to create cart');
      
      const cart = await res.json();
      setCarts(prev => [...prev, cart]);
      setSelectedCart(cart.id);
      return cart;
    } catch (err) {
      console.error('Error creating cart:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const addToCart = async (recordId) => {
    if (!selectedCart) {
      throw new Error('No cart selected');
    }
    try {
      setError(null);
      const res = await apiFetch(`/catalog/sudoc/cart/${selectedCart}/records/${recordId}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`
        }
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || `Failed to add to cart (${res.status})`);
      }
      
      await loadCarts(); // Refresh carts to show new item
    } catch (err) {
      console.error('Error adding to cart:', err);
      setError(err.message);
      throw err;
    }
  };

  const removeFromCart = async (recordId) => {
    if (!selectedCart) {
      throw new Error('No cart selected');
    }
    try {
      setError(null);
      const res = await apiFetch(`/catalog/sudoc/cart/${selectedCart}/records/${recordId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`
        }
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || `Failed to remove from cart (${res.status})`);
      }
      
      await loadCarts(); // Refresh carts to show updated items
    } catch (err) {
      console.error('Error removing from cart:', err);
      setError(err.message);
      throw err;
    }
  };

  const deleteCart = async (cartId) => {
    try {
      setLoading(true);
      setError(null);
      
      const res = await apiFetch(`/catalog/sudoc/cart/${cartId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`
        }
      });
      
      if (!res.ok) {
        throw new Error('Failed to delete cart');
      }
      
      // Remove cart from state
      setCarts(carts.filter(c => c.id !== cartId));
      
      // If this was the selected cart, clear selection
      if (selectedCart === cartId) {
        setSelectedCart(null);
      }
      
    } catch (err) {
      console.error('Error deleting cart:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return {
    carts,
    selectedCart,
    setSelectedCart,
    createCart,
    addToCart,
    removeFromCart,
    deleteCart,
    loadCarts,
    loading,
    error
  };
}