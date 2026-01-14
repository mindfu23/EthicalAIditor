import React from 'react';
import { AuthProvider, AuthModal } from './lib/auth';
import { TenantProvider } from './lib/tenant';
import Editor from './components/Editor';

function App() {
  return (
    <TenantProvider>
      <AuthProvider>
        <Editor />
        <AuthModal />
      </AuthProvider>
    </TenantProvider>
  );
}

export default App;
