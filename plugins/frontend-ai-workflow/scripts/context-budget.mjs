export const AUTOMATIC_CONTEXT_BUDGETS = Object.freeze({
  frontendDeliverySkill: Object.freeze({ bytes: 3000, nonEmptyLines: 35 }),
  managedAgents: Object.freeze({ bytes: 2500, listItems: 20 }),
});

function countNonEmptyLines(content) {
  return String(content).split(/\r?\n/u).filter((line) => line.trim()).length;
}

function countListItems(content) {
  return String(content).split(/\r?\n/u).filter((line) => /^\s*(?:[-*+]\s+|\d+\.\s+)/u.test(line)).length;
}

function diagnostic(target, metric, actual, limit) {
  return {
    code: 'automatic_context_budget_exceeded',
    status: 'failed',
    target,
    metric,
    actual,
    limit,
  };
}

export function measureAutomaticContextAsset(content) {
  return {
    bytes: Buffer.byteLength(String(content)),
    nonEmptyLines: countNonEmptyLines(content),
    listItems: countListItems(content),
  };
}

export function validateAutomaticContextBudgets({ frontendDeliverySkill = '', managedAgents = '' } = {}) {
  const assets = {
    frontendDeliverySkill: measureAutomaticContextAsset(frontendDeliverySkill),
    managedAgents: measureAutomaticContextAsset(managedAgents),
  };
  const diagnostics = [];
  for (const [metric, limit] of Object.entries(AUTOMATIC_CONTEXT_BUDGETS.frontendDeliverySkill)) {
    const actual = assets.frontendDeliverySkill[metric];
    if (actual > limit) diagnostics.push(diagnostic('skills/frontend-delivery/SKILL.md', metric, actual, limit));
  }
  for (const [metric, limit] of Object.entries(AUTOMATIC_CONTEXT_BUDGETS.managedAgents)) {
    const actual = assets.managedAgents[metric];
    if (actual > limit) diagnostics.push(diagnostic('assets/templates/AGENTS.md', metric, actual, limit));
  }
  return {
    ok: diagnostics.length === 0,
    budgets: AUTOMATIC_CONTEXT_BUDGETS,
    assets,
    diagnostics,
  };
}
