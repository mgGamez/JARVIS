/** Future tools must have a server-owned implementation and explicit confirmation
 * for side effects. The model cannot execute tools in this initial release. */
export const tools = Object.freeze([
  { id: 'memory', name: 'Personal memory', status: 'available', description: 'Save and remove approved facts using the browser memory panel.', execution: 'local-user-action', requiresApproval: true },
  { id: 'search', name: 'Web search', status: 'planned', description: 'Live web sources and citations.', requiresApproval: false },
  { id: 'research', name: 'Product research', status: 'planned', description: 'Compare products against your criteria.', requiresApproval: false },
  { id: 'reminders', name: 'Reminders', status: 'planned', description: 'Requires a persistent scheduler and notification permissions.', requiresApproval: true },
  { id: 'automation', name: 'Automation', status: 'planned', description: 'Requires supported integrations and per-action approval.', requiresApproval: true }
]);
