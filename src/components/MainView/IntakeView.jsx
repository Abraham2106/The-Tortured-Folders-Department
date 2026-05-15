import { useState, useEffect, useCallback } from 'react';
import styles from './Intake.module.css';
import { Mailbox, Archive, Plus, Trash2, RefreshCw, Folder, FolderOpen } from 'lucide-react';
import { useProfileStore } from '../../store/useProfileStore';

export const IntakeView = () => {
  const { activeProfile } = useProfileStore();
  const [watchFolders, setWatchFolders] = useState([]);
  const [truthSource, setTruthSource] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [processingLog, setProcessingLog] = useState([]);

  const loadIntakeData = useCallback(async () => {
    if (!activeProfile) return;
    try {
      const folders = await window.api.intake.listWatchFolders(activeProfile.id);
      const source = await window.api.intake.getTruthSource(activeProfile.id);
      setWatchFolders(folders);
      setTruthSource(source);
      await window.api.intake.startWatcher(activeProfile.id);
    } catch (error) {
      console.error('Failed to load intake data:', error);
    }
  }, [activeProfile]);

  useEffect(() => {
    void (async () => {
      await loadIntakeData();
    })();

    const removeListener = window.api.intake.onStatus((data) => {
      setProcessingLog((prev) => [{
        id: Date.now(),
        ...data,
        timestamp: new Date().toLocaleTimeString()
      }, ...prev].slice(0, 10));
    });

    return () => {
      if (typeof removeListener === 'function') removeListener();
    };
  }, [loadIntakeData]);

  const handleAddWatchFolder = async () => {
    const path = await window.api.dialog.openFolder();
    if (path) {
      try {
        await window.api.intake.addWatchFolder(activeProfile.id, path);
        await loadIntakeData();
      } catch (error) {
        console.error('Error adding watch folder:', error);
        alert('Error al agregar el buzón');
      }
    }
  };

  const handleDeleteWatchFolder = async (watchFolderId) => {
    if (!activeProfile?.id) return;
    if (!window.confirm('¿Seguro que quieres eliminar este buzón?')) return;

    try {
      await window.api.intake.deleteWatchFolder(activeProfile.id, watchFolderId);
      await loadIntakeData();
    } catch (error) {
      console.error('Error deleting watch folder:', error);
      alert(`Error al eliminar el buzón: ${error?.message || 'error desconocido'}`);
    }
  };

  const handleSetTruthSource = async () => {
    const path = await window.api.dialog.openFolder();
    if (path) {
      setIsLoading(true);
      try {
        await window.api.intake.setTruthSource(activeProfile.id, path);
        await loadIntakeData();
      } catch (error) {
        console.error('Error setting truth source:', error);
        alert('Error al configurar la fuente de verdad');
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <div className={styles.container}>
      <h2 className={styles.mainTitle}>Mesa de ingreso</h2>
      <p className={styles.subtitle}>Define tus buzones de recepción y deja que Intake archive archivos automáticamente usando tu estructura de carpetas como fuente de verdad.</p>

      <div className={styles.grid}>
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.titleGroup}>
              <Mailbox size={20} />
              <h3>Buzones de recepción</h3>
            </div>
            <button className={styles.addBtn} onClick={handleAddWatchFolder}>
              <Plus size={16} />
              <span>Agregar buzón</span>
            </button>
          </div>
          <div className={styles.folderList}>
            {watchFolders.length === 0 ? (
              <div className={styles.empty}>No hay buzones configurados.</div>
            ) : (
              watchFolders.map((folder) => (
                <div key={folder.id} className={styles.folderItem}>
                  <div className={styles.folderInfo}>
                    <span className={styles.folderLabel}>{folder.label}</span>
                    <span className={styles.folderPath}>{folder.path}</span>
                  </div>
                  <button
                    className={styles.deleteBtn}
                    onClick={() => handleDeleteWatchFolder(folder.id)}
                    title="Eliminar buzón"
                    aria-label={`Eliminar buzón ${folder.label}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.titleGroup}>
              <Archive size={20} />
              <h3>Fuente de verdad</h3>
            </div>
            <button className={styles.actionBtn} onClick={handleSetTruthSource} disabled={isLoading}>
              {isLoading ? <RefreshCw size={16} className={styles.spinner} /> : <Plus size={16} />}
              <span>{truthSource ? 'Actualizar raíz' : 'Definir raíz'}</span>
            </button>
          </div>

          {truthSource ? (
            <div className={styles.truthSourceContent}>
              <div className={styles.rootInfo}>
                <Folder size={16} />
                <span>{truthSource.root_path}</span>
              </div>
              <div className={styles.treeMap}>
                {truthSource.structure_map.destinations.map((dest) => (
                  <div key={dest.path} className={styles.treeItem}>
                    <div className={styles.destName}>
                      <FolderOpen size={14} />
                      <span>{dest.name}</span>
                    </div>
                    {dest.subcategories.map((sub) => (
                      <div key={sub} className={styles.subItem}>
                        <span className={styles.subBullet} />
                        <span>{sub}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className={styles.empty}>
              Define un directorio raíz para generar tu mapa estructural.
            </div>
          )}
        </section>
      </div>

      <section className={`${styles.section} ${styles.activitySection}`}>
        <div className={styles.sectionHeader}>
          <div className={styles.titleGroup}>
            <RefreshCw size={18} className={processingLog.length > 0 ? styles.spinner : ''} />
            <h3>Actividad en vivo</h3>
          </div>
        </div>
        <div className={styles.activityList}>
          {processingLog.length === 0 ? (
            <div className={styles.empty}>En espera... Suelta un archivo en un buzón para comenzar.</div>
          ) : (
            processingLog.map((log) => {
              const detailMessage = log.message || log.reason || '';

              return (
                <div key={log.id} className={styles.activityItem}>
                  <div className={styles.activityHeader}>
                    <span className={styles.logTime}>[{log.timestamp}]</span>
                    <span className={styles.logPath}>{log.filePath.split(/[\\/]/).pop()}</span>
                    <span className={`${styles.logStatus} ${styles[log.event]}`}>
                      {log.event === 'processing' ? 'Detectando...'
                        : log.event === 'classifying' ? 'Clasificando...'
                        : log.event === 'classified' ? 'Archivado automáticamente'
                        : log.event === 'review_required' ? 'Revisión requerida'
                        : log.event === 'rejected' ? 'Rechazado'
                        : log.event === 'extracted' ? 'Listo'
                        : (log.event === 'error' ? 'Atención requerida' : 'Error')}
                    </span>
                  </div>
                  {detailMessage ? (
                    <div className={styles.logMessage}>{detailMessage}</div>
                  ) : null}
                  {Array.isArray(log.alternatives) && log.alternatives.length > 0 ? (
                    <div className={styles.logAlternatives}>
                      Alternativas: {log.alternatives.join(' | ')}
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
};
