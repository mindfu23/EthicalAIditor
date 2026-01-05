import React, { useState } from 'react';
import Auth from './components/Auth';
import Editor from './components/Editor';

function App() {
  const [user, setUser] = useState(null);

  const handleLogin = (userData) => {
    setUser(userData);
  };

  const handleLogout = () => {
    setUser(null);
  };

  if (!user) {
    return <Auth onLogin={handleLogin} />;
  }

  return <Editor user={user} onLogout={handleLogout} />;
}

export default App;
