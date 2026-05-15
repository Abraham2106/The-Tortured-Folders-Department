import React, { useState, useEffect } from 'react';
import styles from './Intake.module.css';
import { Mailbox, Archive, Plus, Trash2, RefreshCw, Folder } from 'lucide-react';
import { useProfileStore } from '../../store/useProfileStore';

export const IntakeView = () => {
  const { activeProfile } = useProfileStore();
  const [watchFolders, setWatchFolders] = useState([]);
  const [truthSource, setTruthSource] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [processingLog, setProcessingLog] = useState([]);

  const loadIntakeData = async () => {
    if (!activeProfile) return;
    try {
      const folders = await window.api.intake.listWatchFolders(activeProfile.id);
      const source = await window.api.intake.getTruthSource(activeProfile.id);
      setWatchFolders(folders);
      setTruthSource(source);
      
      // Start the watcher
      await window.api.intake.startWatcher(activeProfile.id);
    } catch (error) {
      console.error('Failed to load intake data:', error);
    }
  };

  useEffect(() => {
    loadIntakeData();

    // Listen for real-time status updates
    const removeListener = window.api.intake.onStatus((data) => {
      setProcessingLog(prev => [{
        id: Date.now(),
        ...data,
        timestamp: new Date().toLocaleTimeString()
      }, ...prev].slice(0, 10)); // Keep last 10
    });

    return () => {
      if (typeof removeListener === 'function') removeListener();
    };
  }, [activeProfile]);

  const handleAddWatchFolder = async () => {
    const path = await window.api.dialog.openFolder();
    if (path) {
      try {
        await window.api.intake.addWatchFolder(activeProfile.id, path);
        loadIntakeData();
      } catch (error) {
        alert('Error adding watch folder');
      }
    }
  };

  const handleSetTruthSource = async () => {
    const path = await window.api.dialog.openFolder();
    if (path) {
      setIsLoading(true);
      try {
        const map = await window.api.intake.setTruthSource(activeProfile.id, path);
        loadIntakeData();
      } catch (error) {
        alert('Error setting truth source');
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <div className={styles.container}>
      <h2 className={styles.mainTitle}>The Intake Desk</h2>
      <p className={styles.subtitle}>Designate your reception boxes and establish the structural source of truth.</p>

      <div className={styles.grid}>
        {/* Section: Buzones */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.titleGroup}>
              <Mailbox size={20} />
              <h3>Buzones (Reception)</h3>
            </div>
            <button className={styles.addBtn} onClick={handleAddWatchFolder}>
              <Plus size={16} />
              <span>Add Box</span>
            </button>
          </div>
          <div className={styles.folderList}>
            {watchFolders.length === 0 ? (
              <div className={styles.empty}>No watch folders configured.</div>
            ) : (
              watchFolders.map(folder => (
                <div key={folder.id} className={styles.folderItem}>
                  <div className={styles.folderInfo}>
                    <span className={styles.folderLabel}>{folder.label}</span>
                    <span className={styles.folderPath}>{folder.path}</span>
                  </div>
                  <button className={styles.deleteBtn}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Section: Fuente de Verdad */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.titleGroup}>
              <Archive size={20} />
              <h3>Fuente de Verdad (Hierarchy)</h3>
            </div>
            <button className={styles.actionBtn} onClick={handleSetTruthSource} disabled={isLoading}>
              {isLoading ? <RefreshCw size={16} className={styles.spinner} /> : <Plus size={16} />}
              <span>{truthSource ? 'Update Root' : 'Set Root'}</span>
            </button>
          </div>
          
          {truthSource ? (
            <div className={styles.truthSourceContent}>
              <div className={styles.rootInfo}>
                <Folder size={16} />
                <span>{truthSource.root_path}</span>
              </div>
              <div className={styles.treeMap}>
                {truthSource.structure_map.destinations.map(dest => (
                  <div key={dest.path} className={styles.treeItem}>
                    <div className={styles.destName}>├── 📁 {dest.name}</div>
                    {dest.subcategories.map(sub => (
                      <div key={sub} className={styles.subItem}>│   └── 📄 {sub}</div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className={styles.empty}>
              Establish a root directory to generate your structural map.
            </div>
          )}
        </section>
      </div>

      {/* Live Activity Section */}
      <section className={`${styles.section} ${styles.activitySection}`}>
        <div className={styles.sectionHeader}>
          <div className={styles.titleGroup}>
            <RefreshCw size={18} className={processingLog.length > 0 ? styles.spinner : ''} />
            <h3>Live Activity</h3>
          </div>
        </div>
        <div className={styles.activityList}>
          {processingLog.length === 0 ? (
            <div className={styles.empty}>Standing by... Drop a file into a watch folder to begin.</div>
          ) : (
            processingLog.map(log => (
              <div key={log.id} className={styles.activityItem}>
                <span className={styles.logTime}>[{log.timestamp}]</span>
                <span className={styles.logPath}>{log.filePath.split(/[\\/]/).pop()}</span>
                <span className={`${styles.logStatus} ${styles[log.event]}`}>
                  {log.event === 'processing' ? 'Detecting...' : 
                   log.event === 'classifying' ? 'Classifying...' : 
                   log.event === 'classified' ? 'Archived' :
                   log.event === 'extracted' ? 'Ready' : 'Error'}
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
};
