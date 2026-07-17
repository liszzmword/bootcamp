import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { router } from './routes/router';
import { ensureAuth } from './lib/supabase';
import { ToastStack } from './components/ui';

const queryClient = new QueryClient();

export default function App() {
  const [ready, setReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    ensureAuth()
      .then(() => setReady(true))
      .catch((e) => { setAuthError(e.message); setReady(true); });
  }, []);

  if (!ready) return null; // 프로필 로딩 전 플리커 방지
  return (
    <QueryClientProvider client={queryClient}>
      {authError && (
        <div style={{ background: 'var(--color-danger)', color: '#fff', padding: '8px 16px', fontSize: 13 }}>
          {authError}
        </div>
      )}
      <RouterProvider router={router} />
      <ToastStack />
    </QueryClientProvider>
  );
}
