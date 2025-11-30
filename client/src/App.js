import React, { useState, useEffect, useCallback } from 'react';
import './main.css';
import { saveRef, loadRef, clearRef } from './idbHelper';

const PAYSTACK_PERCENTAGE_FEE = 0.1;

// === Helper components ===

const Loader = ({ message }) => (
  <div id="loader-container" className="loader-container" style={{ display: 'flex' }}>
    <div className="loader"></div>
    <div className="status-text">{message}</div>
  </div>
);

const Notification = ({ message, type, onHide }) => {
  useEffect(() => {
    const timer = setTimeout(onHide, 4000);
    return () => clearTimeout(timer);
  }, [onHide]);

  return (
    <div id="notification" className={`slide-notification ${type} show`}>
      {message}
    </div>
  );
};

const PaymentResult = ({ status, reference, data, onTryAgain, onNewPayment, onCheckStatus }) => {
  const statusMap = {
    success: { color: '#47c363', msg: 'Payment successful!' },
    failed: { color: '#fc544b', msg: 'Payment failed. Please try again.' },
    abandoned: { color: '#fd7e14', msg: 'Payment was abandoned.' },
    pending: { color: '#007bff', msg: 'Payment is being processed...' }
  };

  const cfg = statusMap[status] || { color: '#fc544b', msg: 'An error occurred.' };
  const amountNaira = data && data.amount ? (data.amount / 100).toFixed(2) : '';

  return (
    <div id="payment-result" style={{ display: 'block' }}>
      <div className={`payment-result ${status}`}>
        <h3 style={{ color: cfg.color }}>{cfg.msg}</h3>
        <p><strong>Reference:</strong> {reference}</p>
        {amountNaira && <p><strong>Amount:</strong> ₦{Number(amountNaira).toFixed(2)}</p>}
        {data && data.paid_at && <p><small>Paid: {new Date(data.paid_at).toLocaleString()}</small></p>}
        <div className="action-buttons">
          {status === 'pending' && <button onClick={onCheckStatus} className="btn check-status">Check Status</button>}
          {status !== 'success' && <button onClick={onTryAgain} className="btn try-again">Try Again</button>}
          {status === 'success' && <button onClick={onNewPayment} className="btn btn-primary">New Payment</button>}
        </div>
      </div>
    </div>
  );
};

// === Reference Management ===
const generatePaystackRef = () => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 8).toUpperCase();
    return `PS_${timestamp}_${random}`;
};

// === Browser/Device Detection ===
const isProblematicBrowser = () => {
    const ua = navigator.userAgent.toLowerCase();
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    const isIOS = /ipad|iphone|ipod/.test(ua) && !window.MSStream;
    const isFacebookInApp = (ua.indexOf('fban') > -1) || (ua.indexOf('fbav') > -1);
    const isTelegramInApp = (ua.indexOf('telegram') > -1);

    // Safari on macOS and all iOS browsers are problematic due to ITP and popup blocking.
    return isSafari || isIOS || isFacebookInApp || isTelegramInApp;
};


function App() {
  const [email, setEmail] = useState('');
  const [amount, setAmount] = useState('');
  const [fee, setFee] = useState(0);
  const [total, setTotal] = useState(0);

  const [loading, setLoading] = useState(true);
  const [loaderMessage, setLoaderMessage] = useState('Loading...');
  const [notification, setNotification] = useState(null);
  const [result, setResult] = useState(null);
  const [currentPaystackRef, setCurrentPaystackRef] = useState(null);

  useEffect(() => {
    // The fee is 10% plus a ₦100 flat fee for amounts >= ₦2500, capped at ₦2000.
    const numericAmount = parseFloat(amount) || 0;
    let calculatedFee = numericAmount * PAYSTACK_PERCENTAGE_FEE;
    if (numericAmount >= 2500) {
        calculatedFee += 100;
    }
    if (calculatedFee > 2000) {
        calculatedFee = 2000;
    }
    const calculatedTotal = numericAmount + calculatedFee;

    setFee(calculatedFee);
    setTotal(calculatedTotal);
  }, [amount]);

  const fmt = (n) => Number(n).toFixed(2);

  const showNotification = (message, type = 'error') => {
    setNotification({ message, type });
  };

  const hideNotification = () => {
    setNotification(null);
  };

  const pollVerification = useCallback(async (reference) => {
    setLoading(true);
    setLoaderMessage('Verifying payment...');

    try {
      const response = await fetch(`/api/verify?reference=${encodeURIComponent(reference)}`);
      const data = await response.json();

      if (response.ok) {
        setResult({ status: data.status, reference, data: data });
        if (data.status === 'success') {
          await clearRef();
        }
      } else {
        showNotification(data.message || 'Verification failed', 'error');
        setResult({ status: 'failed', reference, data: data });
      }
    } catch (error) {
      showNotification('An error occurred during verification.', 'error');
      setResult({ status: 'failed', reference, data: null });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialize = async () => {
      const params = new URLSearchParams(window.location.search);
      const refFromUrl = params.get('reference');

      if (refFromUrl) {
        await saveRef(refFromUrl);
        setCurrentPaystackRef(refFromUrl);
        await pollVerification(refFromUrl);
        window.history.replaceState({}, '', window.location.pathname);
      } else {
        const refFromDb = await loadRef();
        if (refFromDb) {
          setCurrentPaystackRef(refFromDb);
          await pollVerification(refFromDb);
        } else {
          setLoading(false);
        }
      }
    };
    initialize();
  }, [pollVerification]);

  const openCenterPopup = (url, w = 600, h = 700) => {
    const left = (window.screen.width / 2) - (w / 2);
    const top = (window.screen.height / 2) - (h / 2);
    return window.open(url, 'pay_popup', `toolbar=no,location=no,status=no,menubar=no,scrollbars=yes,resizable=yes,width=${w},height=${h},top=${top},left=${left}`);
  };

  const openPaymentPopupOrRedirect = (url, paystackRef) => {
    const isProblematic = isProblematicBrowser();
    const isInIframe = window.top !== window.self;

    if (isProblematic || isInIframe) {
      setLoaderMessage('Redirecting to payment page...');
      window.location.href = url;
      return;
    }

    const popup = openCenterPopup(url);

    if (!popup || popup.closed || typeof popup.closed === 'undefined') {
      setLoaderMessage('Popup blocked. Redirecting...');
      window.location.href = url;
    } else {
      setLoaderMessage('Opening payment window...');
      const popupWatch = setInterval(() => {
        if (popup.closed) {
          clearInterval(popupWatch);
          pollVerification(paystackRef);
        }
      }, 700);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!email || !amount || amount <= 0) {
      showNotification('Please enter a valid email and amount', 'error');
      return;
    }

    setLoading(true);
    setLoaderMessage('Initializing payment...');

    const paystackRef = generatePaystackRef();
    await saveRef(paystackRef);
    setCurrentPaystackRef(paystackRef);

    const amountToPay = total;

    try {
      const response = await fetch('/api/initialize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          amount: amountToPay,
          reference: paystackRef,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        openPaymentPopupOrRedirect(data.authorization_url, paystackRef);
      } else {
        showNotification(data.message || 'Initialization failed', 'error');
        setLoading(false);
      }
    } catch (error) {
      showNotification('An error occurred.', 'error');
      setLoading(false);
    }
  };

  const resetForm = async () => {
    setEmail('');
    setAmount('');
    setResult(null);
    setCurrentPaystackRef(null);
    await clearRef();
  }

  const handleTryAgain = () => {
    setResult(null);
  };

  const handleNewPayment = async () => {
    await resetForm();
  };

  const handleCheckStatus = () => {
    if (currentPaystackRef) {
      pollVerification(currentPaystackRef);
    }
  };

  const renderContent = () => {
    if (loading) {
      return <Loader message={loaderMessage} />;
    }

    if (result) {
      return <PaymentResult {...result} onTryAgain={handleTryAgain} onNewPayment={handleNewPayment} onCheckStatus={handleCheckStatus} />;
    }

    return (
       <div className="payment-body" id="payment-form-container">
        <form id="payment-form" autoComplete="off" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              className="form-control"
              placeholder="you@example.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="amount">Amount (₦)</label>
            <input
              id="amount"
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              className="form-control"
              placeholder="1000.00"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={loading}
            />
            <div className="fee-info"><i>i</i> Fee (display): ₦<span id="fee-amount">{fmt(fee)}</span></div>
            <div className="fee-info"><i>i</i> Total (display): ₦<span id="total-amount">{fmt(total)}</span></div>
          </div>

          <button type="submit" id="pay-btn" className="btn btn-primary" disabled={loading}>
            {loading ? 'Processing...' : `Pay ₦${fmt(total)}`}
          </button>
        </form>
      </div>
    );
  };

  return (
    <div className="payment-card">
      <div className="payment-header">
        <h2>User Form</h2>
        <p className="sub">Enter your email and amount. Fee shown for reference.</p>
      </div>

      {renderContent()}

      {notification && <Notification {...notification} onHide={hideNotification} />}
    </div>
  );
}

export default App;
