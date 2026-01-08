import React from 'react';
import { AuthProvider, AuthModal } from './lib/auth';
import Editor from './components/Editor';

function App() {
  return (
    <AuthProvider>
      <Editor />
      <AuthModal />
    </AuthProvider>
  );
}

export default App;
