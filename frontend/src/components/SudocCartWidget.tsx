import React, { useState } from 'react';
import { PlusCircle, X, ShoppingCart } from 'lucide-react';

interface CartWidgetProps {
  selectedCartId: number | null;
  carts: Array<{
    id: number;
    name: string;
    items?: Array<{  // Make items optional
      id: number;
      record_id: number;
      sudoc?: string;
    }>;
  }>;
  onCreateCart: (name: string) => void;
  onSelectCart: (id: number) => void;
  className?: string;
}

export const SudocCartWidget: React.FC<CartWidgetProps> = ({
  selectedCartId,
  carts = [], // Add default empty array
  onCreateCart,
  onSelectCart,
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const selectedCart = carts.find(c => c.id === selectedCartId);

  const handleCreateCart = async () => {
    try {
      const name = prompt('Enter cart name:');
      if (!name) return;
      
      await onCreateCart(name);
      // Keep widget open after creation
      setIsOpen(true);
    } catch (err) {
      alert('Failed to create cart: ' + err.message);
    }
  };

  return (
    <div className={`fixed top-4 right-4 z-50 ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="bg-white p-2 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 border border-gray-200 flex items-center gap-2"
      >
        <ShoppingCart className="h-5 w-5" />
        {selectedCart && (
          <span className="text-sm font-medium">{selectedCart.name}</span>
        )}
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-lg shadow-xl border border-gray-200">
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-700">SuDoc Carts</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2">
              {carts.map(cart => (
                <button
                  key={cart.id}
                  onClick={() => {
                    onSelectCart(cart.id);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-md transition-colors ${
                    cart.id === selectedCartId
                      ? 'bg-blue-50 text-blue-700'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>{cart.name}</span>
                    <span className="text-sm text-gray-500">
                      {cart.items?.length ?? 0}  {/* Add null check */}
                    </span>
                  </div>
                </button>
              ))}

              {carts.length === 0 && (  // Add empty state
                <p className="text-sm text-gray-500 text-center py-2">
                  No carts yet
                </p>
              )}
            </div>

            <button
              onClick={handleCreateCart}
              className="mt-4 w-full flex items-center justify-center gap-2 text-sm text-blue-600 hover:text-blue-800"
            >
              <PlusCircle className="h-4 w-4" />
              New Cart
            </button>
          </div>
        </div>
      )}
    </div>
  );
};