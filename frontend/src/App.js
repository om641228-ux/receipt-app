import React, { useState, useEffect } from 'react';
import './App.css';

// ✅ Жёстко прописан URL бэкенда на Railway
const API_URL = 'https://backend-production-adc7.up.railway.app';

function App() {
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/api/receipts`)
      .then(res => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        return res.json();
      })
      .then(data => {
        const receiptsArray = data.receipts || data || [];
        setReceipts(Array.isArray(receiptsArray) ? receiptsArray : []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching receipts:', err);
        setReceipts([]);
        setLoading(false);
      });
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <h1>Receipt Manager</h1>
      </header>
      <main>
        {loading ? (
          <p>Loading...</p>
        ) : (
          <div className="receipts-list">
            {receipts.length === 0 ? (
              <p>No receipts found</p>
            ) : (
              receipts.map(receipt => (
                <div key={receipt.id} className="receipt-card">
                  <h3>{receipt.store_name_ru || receipt.store_name || 'Unknown Merchant'}</h3>
                  <p>Amount: {receipt.total_amount} {receipt.currency}</p>
                  <p>Date: {receipt.receipt_date}</p>
                </div>
              ))
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;