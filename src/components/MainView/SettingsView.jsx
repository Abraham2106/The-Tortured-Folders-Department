import React, { useState, useEffect } from 'react';
import styles from './SettingsView.module.css';
import { Save, AlertCircle, Terminal, Shield } from 'lucide-react';

export const SettingsView = () => {
  const [settings, setSettings] = useState({ anthropic_api_key: '', ai_model: '' });
  const [logs, setLogs] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
    loadLogs();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await window.api.settings.get();
      if (data) setSettings(data);
    } catch (err) {
      console.error('Error loading settings:', err);
    }
  };

  const loadLogs = async () => {
    try {
      const data = await window.api.logs.get(30);
      if (data) setLogs(data);
    } catch (err) {
      console.error('Error loading logs:', err);
    }
  };

  const handleUpdate = async (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const saveSettings = async () => {
    try {
      setSaving(true);
      await window.api.settings.update('anthropic_api_key', settings.anthropic_api_key || '');
      await window.api.settings.update('ai_model', settings.ai_model || 'claude-opus-5');
      alert('Configuración guardada con éxito.');
    } catch (err) {
      console.error('Error saving settings:', err);
      alert(`Error al guardar: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <Shield size={24} className={styles.icon} />
          <h1>Privacidad y configuración</h1>
        </div>
        <button className={styles.saveButton} onClick={saveSettings} disabled={saving}>
          <Save size={16} />
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </header>

      <div className={styles.grid}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <AlertCircle size={18} />
            <h2>Configuración de IA</h2>
          </div>
          <p className={styles.description}>
            Configura tu conexión con el Departamento. Tus datos y claves se guardan localmente.
          </p>

          <div className={styles.field}>
            <label>API Key de Anthropic (Claude)</label>
            <input
              type="password"
              value={settings.anthropic_api_key || ''}
              onChange={(e) => handleUpdate('anthropic_api_key', e.target.value)}
              placeholder="sk-ant-..."
            />
            <small>Tu clave de la API de Anthropic. Se guarda localmente.</small>
          </div>

          <div className={styles.field}>
            <label>Modelo de Claude</label>
            <input
              type="text"
              value={settings.ai_model || ''}
              onChange={(e) => handleUpdate('ai_model', e.target.value)}
              placeholder="claude-opus-5"
            />
            <small>Identificador del modelo, por ejemplo claude-opus-5.</small>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <Terminal size={18} />
            <h2>Registros de actividad</h2>
          </div>
          <div className={styles.logContainer}>
            {logs.length === 0 ? (
              <div className={styles.emptyLogs}>No hay registros recientes.</div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className={styles.logEntry}>
                  <span className={styles.logTime}>
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span className={styles.logLevel}>{log.level}</span>
                  <span className={styles.logMessage}>{log.message}</span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
