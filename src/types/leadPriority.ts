// ─── Criteria definitions ─────────────────────────────────────────────────────

export interface Criterion {
  id: string;
  label: string;
  points: number;
  type: 'positive' | 'negative';
  group?: 'budget'; // mutually exclusive group
}

export const CRITERIA: Criterion[] = [
  // ── Positive ──
  { id: 'relevant_skillset',   label: 'Project is relevant to our skillset',                                            points: 7,  type: 'positive' },
  { id: 'case_study',          label: 'We have a similar project with case study, screenshot, or live link to share',    points: 6,  type: 'positive' },
  { id: 'budget_makes_sense',  label: 'Budget makes sense based on timeline, workload, and team effort',                points: 6,  type: 'positive' },
  { id: 'can_deliver',         label: 'Team can deliver without major learning, risk, or uncertainty',                   points: 5,  type: 'positive' },
  { id: 'budget_high',         label: 'High budget: $8K+ or full-time',                                                 points: 8,  type: 'positive', group: 'budget' },
  { id: 'budget_medium',       label: 'Medium budget: $2K to $8K',                                                      points: 5,  type: 'positive', group: 'budget' },
  { id: 'budget_low',          label: 'Low budget: less than $2K',                                                      points: 2,  type: 'positive', group: 'budget' },
  { id: 'retainer_potential',  label: 'Can lead to retainer, full-time work, maintenance, phase 2, or upsell',          points: 4,  type: 'positive' },
  { id: 'good_client_profile', label: 'Client has a good profile and spending history',                                  points: 4,  type: 'positive' },
  { id: 'serious_client',      label: 'Client looks serious, or scope is clear and shows a real business problem',       points: 3,  type: 'positive' },
  { id: 'urgency',             label: 'Client has an active pain point, deadline, pressure, or reason to move quickly',  points: 3,  type: 'positive' },
  { id: 'decision_maker',      label: 'Access to decision maker',                                                        points: 3,  type: 'positive' },
  { id: 'competition_edge',    label: 'Competition is manageable, or we have a clear edge',                              points: 1,  type: 'positive' },

  // ── Negative ──
  { id: 'unpaid_work',         label: 'Client asks for unpaid work, a free test, or too much free consultation',         points: -6, type: 'negative' },
  { id: 'poor_reviews',        label: 'Client has poor reviews, disputes, or negative feedback from freelancers',        points: -6, type: 'negative' },
  { id: 'price_shopping',      label: 'Client appears to be gathering information or price quotes only',                  points: -5, type: 'negative' },
  { id: 'scope_changed',       label: 'Client changed direction or scope after connecting',                               points: -5, type: 'negative' },
  { id: 'harsh_tone',          label: 'Client has a harsh tone or poor attitude',                                         points: -5, type: 'negative' },
  { id: 'unrealistic_demands', label: 'Client has unrealistic demands (overtime, weekend work, too many calls)',          points: -5, type: 'negative' },
  { id: 'uncontrollable_results', label: "Client's expectations depend on results we cannot fully control",              points: -5, type: 'negative' },
  { id: 'confused_client',     label: 'Client seems confused or unclear about what they need',                            points: -4, type: 'negative' },
  { id: 'too_many_open_jobs',  label: 'Client has too many open jobs',                                                    points: -4, type: 'negative' },
  { id: 'too_many_interviews', label: 'Client is taking too many interviews',                                             points: -3, type: 'negative' },
];

// ── Tier calculation ───────────────────────────────────────────────────────────

export type Tier = 'Low Tier' | 'Medium Tier' | 'High Tier';

export function getTier(score: number): Tier {
  if (score >= 35) return 'High Tier';
  if (score >= 20) return 'Medium Tier';
  return 'Low Tier';
}

export function calcScore(selectedIds: string[]): number {
  return selectedIds.reduce((sum, id) => {
    const c = CRITERIA.find(cr => cr.id === id);
    return sum + (c?.points ?? 0);
  }, 0);
}

// ── Record type ────────────────────────────────────────────────────────────────

export interface LeadPriorityRecord {
  id: string;              // internal UUID
  unique_id: string;       // e.g. UP001
  selected_criteria: string[];
  score: number;
  tier: Tier;
  created_at: string;
  updated_at: string;
}
