import React, { useEffect } from 'react';
import { useProfileStore } from './store/useProfileStore';
import { ProfileSelector } from './components/ProfileSelector';

import { MainView } from './components/MainView/MainView';

function App() {
  const { currentView, activeProfile } = useProfileStore();

  useEffect(() => {
    const root = document.documentElement;
    // For now, always apply 'brisa' theme. We can extend this if more themes are added.
    const themeId = activeProfile?.theme_id || 'brisa';
    root.setAttribute('data-theme', themeId);
  }, [activeProfile]);

  return (
    <>
      {currentView === 'profile-selector' && <ProfileSelector />}
      {currentView === 'main' && <MainView />}
    </>
  );
}

export default App;
