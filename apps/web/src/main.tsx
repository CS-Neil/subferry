import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { MotionConfig } from 'motion/react';
import './index.css';
import { queryClient } from './lib/query-client';
import { router } from './router';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* 尊重系统的"减少动态效果"设置（readme.md 8.4）。 */}
    <MotionConfig reducedMotion="user">
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </MotionConfig>
  </StrictMode>,
);
