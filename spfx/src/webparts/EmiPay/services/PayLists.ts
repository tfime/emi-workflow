/** CECM list/library GUIDs — mirror EMI_PAY_Core_Flow_Phase1/config/list-guids.json */
export const PAY_LISTS = {
  PaymentTypes: '60bb23f6-4702-4aed-b36f-b2b20b09e74d',
  OrgUnits: 'a95e5ccf-00cc-4c7e-b375-828a07117530',
  ChecklistTemplates: '81b94541-2e8e-4457-af28-e47f4d284477',
  Commands: 'e16b76dc-7686-43e9-b232-18c80e2b31d2',
  WorkItems: 'e21ef6e7-ee31-466a-be3b-65ae30ca7722',
  DocumentIndex: 'a45c74cd-1f21-454c-9fcc-6812692b801b',
  ChecklistItems: 'd02c6a03-9561-4d90-b5d5-ad30a2fef88b',
  Requests: '12b3051d-7642-4f90-a39d-5364df561fbf',
  DocsWorking: 'c2b4ef47-2c55-41e4-8b3c-c6480a27bbb2'
} as const;

export const DOCS_WORKING_TITLE = 'EMI_PAY_DocsWorking';

export const CORE_STEPS = [
  'BPCM1_PREPARE',
  'BPCM2_TECH',
  'BPCM3_PRICE',
  'TCKT_CHECK',
  'CHAIR_APPROVE',
  'TCKT_PAY',
  'SYSTEM_ARCHIVE'
] as const;

export type CoreStepKey = (typeof CORE_STEPS)[number];

export function escapeOData(value: string): string {
  return (value || '').replace(/'/g, "''");
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function newKey(prefix: string): string {
  const d = new Date();
  const stamp = [
    d.getUTCFullYear(),
    pad2(d.getUTCMonth() + 1),
    pad2(d.getUTCDate()),
    pad2(d.getUTCHours()),
    pad2(d.getUTCMinutes()),
    pad2(d.getUTCSeconds())
  ].join('');
  const rnd = Math.random().toString(16).slice(2, 8);
  return `${prefix}-${stamp}-${rnd}`;
}
