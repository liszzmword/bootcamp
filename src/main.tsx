import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/base.css';

// ---- 레거시 해시 호환 (배포된 QR: /#code=xxx, 관리자 진입: /#admin) ----
// 라우터 마운트 전에 경로로 변환한다. 기존 v2 앱과 동일한 정규식.
(function absorbLegacyHash() {
  const h = window.location.hash;
  if (!h) return;
  const code = h.match(/[#&]code=([^&]+)/);
  const admin = /(^|[#&])admin([&=]|$)/.test(h);
  if (code) {
    window.history.replaceState(null, '', `/join?code=${encodeURIComponent(decodeURIComponent(code[1]))}`);
  } else if (admin) {
    window.history.replaceState(null, '', '/admin/login');
  }
})();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
