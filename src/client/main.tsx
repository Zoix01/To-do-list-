import '@fontsource/geist/latin-400.css';
import '@fontsource/geist/latin-ext-400.css';
import '@fontsource/geist/latin-500.css';
import '@fontsource/geist/latin-ext-500.css';
import '@fontsource/geist/latin-600.css';
import '@fontsource/geist/latin-ext-600.css';
import '@fontsource/geist-mono/latin-400.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';

import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { FeedbackProvider } from './lib/feedback';
import { persister, PERSIST_MAX_AGE, queryClient } from './lib/queryClient';
import { RouterProvider } from './lib/router';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: PERSIST_MAX_AGE, buster: 'v1' }}
    >
      <FeedbackProvider>
        <RouterProvider>
          <App />
        </RouterProvider>
      </FeedbackProvider>
    </PersistQueryClientProvider>
  </StrictMode>,
);
