import React, { useState, useEffect } from 'react';
import './App.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

function App() {
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/api/receipts`)
      .then(res => res.json())
      .then(data => {
        setReceipts(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching receipts:', err);
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
                  <h3>{receipt.merchant || 'Unknown Merchant'}</h3>
                  <p>Amount: {receipt.amount} {receipt.currency}</p>
                  <p>Date: {receipt.date}</p>
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
