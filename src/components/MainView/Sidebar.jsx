import styles from './MainView.module.css';
import { FolderTree, Clock, Settings, RotateCcw, Inbox } from 'lucide-react';

export const Sidebar = ({ activeTab, setActiveTab }) => {
  return (
    <aside className={styles.sidebar}>
      <nav className={styles.sideNav}>
        <div
          className={`${styles.navItem} ${activeTab === 'workspace' ? styles.active : ''}`}
          onClick={() => setActiveTab('workspace')}
        >
          <FolderTree size={18} />
          <span>Espacio de trabajo</span>
        </div>
        <div
          className={`${styles.navItem} ${activeTab === 'intake' ? styles.active : ''}`}
          onClick={() => setActiveTab('intake')}
        >
          <Inbox size={18} />
          <span>Mesa de ingreso</span>
        </div>
        <div
          className={`${styles.navItem} ${activeTab === 'history' ? styles.active : ''}`}
          onClick={() => setActiveTab('history')}
        >
          <Clock size={18} />
          <span>Historial</span>
        </div>
        <div
          className={`${styles.navItem} ${activeTab === 'rollbacks' ? styles.active : ''}`}
          onClick={() => setActiveTab('rollbacks')}
        >
          <RotateCcw size={18} />
          <span>Reversiones</span>
        </div>
      </nav>
      <div className={styles.sidebarFooter}>
        <div
          className={`${styles.navItem} ${activeTab === 'settings' ? styles.active : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          <Settings size={18} />
          <span>Configuración</span>
        </div>
      </div>
    </aside>
  );
};
