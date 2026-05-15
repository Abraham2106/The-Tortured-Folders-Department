import React, { useState } from 'react';
import styles from './MainView.module.css';
import { Sidebar } from './Sidebar';
import { TopNav } from './TopNav';
import { ChatInterface } from '../Chat/ChatInterface';
import { DiffPreview } from './DiffPreview';
import { ResizablePanels } from './ResizablePanels';
import { HistoryView } from './HistoryView';
import { IntakeView } from './IntakeView';

export const MainView = () => {
  const [diffs, setDiffs] = useState([]);
  const [activeTab, setActiveTab] = useState('workspace'); // 'workspace' | 'history'

  return (
    <div className={styles.container}>
      <TopNav />
      <div className={styles.content}>
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
        <main className={styles.workspace}>
          {activeTab === 'workspace' ? (
            <ResizablePanels
              initialLeftPercent={62}
              minLeftPercent={25}
              maxLeftPercent={80}
              left={
                <div className={styles.chatSection}>
                  <ChatInterface onDiffsReceived={setDiffs} />
                </div>
              }
              right={
                <div className={styles.diffSection}>
                  <DiffPreview diffs={diffs} />
                </div>
              }
            />
          ) : activeTab === 'intake' ? (
            <div className={styles.intakeSection}>
              <IntakeView />
            </div>
          ) : (
            <div className={styles.historySection}>
              <HistoryView />
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
