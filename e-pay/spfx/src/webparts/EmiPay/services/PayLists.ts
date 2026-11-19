/** CECM list/library GUIDs — mirror EMI_PAY_Core_Flow_Phase1/config/list-guids.json */
export const PAY_LISTS = {
  /** 7 Lists cấu hình — GR-PAY-PROCADM Contribute */
  PaymentTypes: '60bb23f6-4702-4aed-b36f-b2b20b09e74d',
  OrgUnits: 'a95e5ccf-00cc-4c7e-b375-828a07117530',
  OrgMembers: '58db4d66-1299-4edb-893e-50c8fe459253',
  WorkflowVersions: 'b263446d-7cea-4fd8-bfde-b22dd2de4281',
  WorkflowSteps: '0135b54a-f4a3-4edc-a738-a64e12feb9ad',
  ChecklistTemplates: '81b94541-2e8e-4457-af28-e47f4d284477',
  StepRecipients: '7ebac733-193d-4216-bf63-785c6a5f06a2',
  /** SYSADM only — không mở cho PROCADM */
  SystemSettings: '2d065a1c-c5f3-42f4-9fba-351967e430c7',
  Commands: 'e16b76dc-7686-43e9-b232-18c80e2b31d2',
  WorkItems: 'e21ef6e7-ee31-466a-be3b-65ae30ca7722',
  DocumentIndex: 'a45c74cd-1f21-454c-9fcc-6812692b801b',
  ChecklistItems: 'd02c6a03-9561-4d90-b5d5-ad30a2fef88b',
  StepReviews: '02a39987-5801-401e-8f3f-ba8caf1c1f4a',
  Requests: '12b3051d-7642-4f90-a39d-5364df561fbf',
  ActivityPublic: '84b57c9e-6b90-4a6b-a200-b3afb4499895',
  ActivityInternal: 'b8ceb7ed-3925-4292-af35-4027f41c9d6a',
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
