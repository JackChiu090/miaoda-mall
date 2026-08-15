import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import IntersectObserver from '@/components/common/IntersectObserver';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider } from '@/contexts/AuthContext';
import { MobileUserProvider } from '@/contexts/MobileUserContext';
import { MemberProvider } from '@/contexts/MemberContext';
import { routes } from './routes';

const App: React.FC = () => {
  return (
    <Router>
      <AuthProvider>
        <MobileUserProvider>
          <MemberProvider>
            <IntersectObserver />
            <Routes>
              {routes.map((route, index) => (
                <Route
                  key={index}
                  path={route.path}
                  element={route.element}
                />
              ))}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            <Toaster />
          </MemberProvider>
        </MobileUserProvider>
      </AuthProvider>
    </Router>
  );
};

export default App;
