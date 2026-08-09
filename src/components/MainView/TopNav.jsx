import React from 'react';
import styles from './MainView.module.css';
import { useProfileStore } from '../../store/useProfileStore';
import { LogOut } from 'lucide-react';

export const TopNav = () => {
  const { activeProfile, logout } = useProfileStore();

  return (
    <header className={styles.topNav}>
      <div className={styles.navBrand}>The Tortured Folders Department</div>
      <div className={styles.navProfile}>
        <span className={styles.profileName}>{activeProfile?.name}</span>
        <button className={styles.iconButton} onClick={logout} title="Cambiar perfil">
          <LogOut size={16} />
        </button>
      </div>
    </header>
  );
};
