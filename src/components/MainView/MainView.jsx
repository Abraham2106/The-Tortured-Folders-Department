import { useEffect, useState } from 'react';
import styles from './MainView.module.css';
import { Sidebar } from './Sidebar';
import { TopNav } from './TopNav';
import { ChatInterface } from '../Chat/ChatInterface';
import { DiffPreview } from './DiffPreview';
import { ResizablePanels } from './ResizablePanels';
import { HistoryView } from './HistoryView';
import { IntakeView } from './IntakeView';
import { SettingsView } from './SettingsView';
import { HitlToastStack } from './HitlToastStack';
import { useProfileStore } from '../../store/useProfileStore';

const isPendingProposal = (proposal) => proposal.status === 'awaiting_approval' || proposal.status === 'modified';

export const MainView = () => {
  const { activeProfile } = useProfileStore();
  const [proposals, setProposals] = useState([]);
  const [selectedProposalId, setSelectedProposalId] = useState(null);
  const [hiddenToastIds, setHiddenToastIds] = useState([]);
  const [activeTab, setActiveTab] = useState('workspace'); // 'workspace' | 'history' | 'intake' | 'settings'

  useEffect(() => {
    if (!activeProfile?.id || !window.api?.hitl) return undefined;

    let isMounted = true;

    const mergeProposal = (proposal) => {
      setProposals((prev) => {
        const next = [...prev];
        const index = next.findIndex((item) => item.id === proposal.id);
        if (index >= 0) {
          next[index] = proposal;
        } else {
          next.unshift(proposal);
        }
        return next;
      });
      setSelectedProposalId((prev) => prev || proposal.id);
    };

    void (async () => {
      try {
        const pending = await window.api.hitl.listPending(activeProfile.id);
        if (!isMounted) return;
        setProposals((prev) => [
          ...pending,
          ...prev.filter((proposal) => proposal.profileId !== activeProfile.id)
        ]);
        if (pending[0]?.id) {
          setSelectedProposalId((prev) => prev || pending[0].id);
        }
      } catch (error) {
        console.error('Failed to load pending HITL proposals:', error);
      }
    })();

    const removeListener = window.api.hitl.onProposal((payload) => {
      const proposal = payload?.proposal;
      if (!proposal || proposal.profileId !== activeProfile.id) return;
      mergeProposal(proposal);
    });

    return () => {
      isMounted = false;
      if (typeof removeListener === 'function') removeListener();
    };
  }, [activeProfile?.id]);

  const registerProposal = (proposal) => {
    if (!proposal) return;

    setProposals((prev) => {
      const next = [...prev];
      const index = next.findIndex((item) => item.id === proposal.id);
      if (index >= 0) {
        next[index] = proposal;
      } else {
        next.unshift(proposal);
      }
      return next;
    });
    setSelectedProposalId(proposal.id);
    setActiveTab('workspace');
  };

  const handleHideToast = (proposalId) => {
    setHiddenToastIds((prev) => (prev.includes(proposalId) ? prev : [...prev, proposalId]));
  };

  const handleSelectProposal = (proposalId) => {
    setSelectedProposalId(proposalId);
    setHiddenToastIds((prev) => prev.filter((id) => id !== proposalId));
    setActiveTab('workspace');
  };

  const handleApproveProposal = async (proposalId, diffs) => {
    try {
      const response = await window.api.hitl.approve(proposalId, diffs);
      if (response?.proposal) {
        registerProposal(response.proposal);
      }
      return response;
    } catch (error) {
      console.error('Failed to approve proposal:', error);
      throw error;
    }
  };

  const handleRejectProposal = async (proposalId) => {
    try {
      const proposal = await window.api.hitl.reject(proposalId);
      if (proposal) {
        registerProposal(proposal);
      }
      return proposal;
    } catch (error) {
      console.error('Failed to reject proposal:', error);
      throw error;
    }
  };

  const handleUpdateProposal = async (proposalId, diffs) => {
    try {
      const proposal = await window.api.hitl.updateProposal(proposalId, diffs);
      if (proposal) {
        registerProposal(proposal);
      }
      return proposal;
    } catch (error) {
      console.error('Failed to update proposal draft:', error);
      throw error;
    }
  };

  const visibleProposals = proposals.filter((proposal) => proposal.profileId === activeProfile?.id);
  const pendingProposals = visibleProposals.filter(isPendingProposal);
  const currentProposal = visibleProposals.find((proposal) => proposal.id === selectedProposalId)
    || visibleProposals[0]
    || null;

  return (
    <div className={styles.container}>
      <TopNav />
      <div className={styles.content}>
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
        <main className={styles.workspace}>
          <HitlToastStack
            proposals={pendingProposals}
            hiddenToastIds={hiddenToastIds}
            onHideToast={handleHideToast}
            onApproveProposal={handleApproveProposal}
            onRejectProposal={handleRejectProposal}
            onSelectProposal={handleSelectProposal}
          />

          {activeTab === 'workspace' ? (
            <ResizablePanels
              initialLeftPercent={62}
              minLeftPercent={25}
              maxLeftPercent={80}
              left={
                <div className={styles.chatSection}>
                  <ChatInterface
                    proposals={proposals}
                    selectedProposalId={selectedProposalId}
                    onProposalReceived={registerProposal}
                    onSelectProposal={handleSelectProposal}
                    onApproveProposal={handleApproveProposal}
                    onRejectProposal={handleRejectProposal}
                  />
                </div>
              }
              right={
                <div className={styles.diffSection}>
                  <DiffPreview
                    proposals={proposals}
                    currentProposal={currentProposal}
                    pendingProposals={pendingProposals}
                    onSelectProposal={handleSelectProposal}
                    onApproveProposal={handleApproveProposal}
                    onRejectProposal={handleRejectProposal}
                    onUpdateProposal={handleUpdateProposal}
                  />
                </div>
              }
            />
          ) : activeTab === 'intake' ? (
            <div className={styles.intakeSection}>
              <IntakeView />
            </div>
          ) : activeTab === 'settings' ? (
            <div className={styles.settingsSection}>
              <SettingsView />
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
