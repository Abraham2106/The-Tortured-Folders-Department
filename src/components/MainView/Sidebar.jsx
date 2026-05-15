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
          <span>Workspace</span>
        </div>
        <div 
          className={`${styles.navItem} ${activeTab === 'intake' ? styles.active : ''}`}
          onClick={() => setActiveTab('intake')}
        >
          <Inbox size={18} />
          <span>The Intake Desk</span>
        </div>
        <div 
          className={`${styles.navItem} ${activeTab === 'history' ? styles.active : ''}`}
          onClick={() => setActiveTab('history')}
        >
          <Clock size={18} />
          <span>History</span>
        </div>
        <div 
          className={`${styles.navItem} ${activeTab === 'rollbacks' ? styles.active : ''}`}
          onClick={() => setActiveTab('rollbacks')}
        >
          <RotateCcw size={18} />
          <span>Rollbacks</span>
        </div>
      </nav>
      <div className={styles.sidebarFooter}>
        <div className={styles.navItem}>
          <Settings size={18} />
          <span>Settings</span>
        </div>
      </div>
    </aside>
  );
};
