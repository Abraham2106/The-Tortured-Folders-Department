import {
  listPendingHitlProposals,
  updateHitlProposalDraft,
  approveHitlProposal,
  rejectHitlProposal
} from '../services/hitl-manager.js';

export const register = (ipcMain) => {
  ipcMain.handle('hitl:list-pending', async (_, profileId) => {
    return listPendingHitlProposals(profileId);
  });

  ipcMain.handle('hitl:update-proposal', async (_, { proposalId, diffs }) => {
    return updateHitlProposalDraft(proposalId, diffs);
  });

  ipcMain.handle('hitl:approve', async (_, { proposalId, diffs }) => {
    return approveHitlProposal(proposalId, diffs);
  });

  ipcMain.handle('hitl:reject', async (_, proposalId) => {
    return rejectHitlProposal(proposalId);
  });
};
