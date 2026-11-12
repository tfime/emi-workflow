import { PAY_LISTS, escapeOData } from './PayLists';
import { ISpRestContext, getItems } from './SpRest';

export interface IPaymentType {
  id: number;
  code: string;
  title: string;
  checklistVersion: number;
  workflowCode: string;
}

export interface IChecklistTemplate {
  id: number;
  paymentTypeCode: string;
  versionNo: number;
  itemCode: string;
  itemLabel: string;
  isRequired: boolean;
  minFileCount: number;
  displayOrder: number;
}

export async function listPaymentTypes(ctx: ISpRestContext): Promise<IPaymentType[]> {
  const rows = await getItems<{
    Id: number;
    Title?: string;
    PaymentTypeCode?: string;
    ChecklistVersion?: number;
    WorkflowCode?: string;
    IsActive?: boolean;
  }>(
    ctx,
    PAY_LISTS.PaymentTypes,
    `$select=Id,Title,PaymentTypeCode,ChecklistVersion,WorkflowCode,IsActive&$top=100`
  );
  return rows
    .filter((r) => r.IsActive !== false && !!r.PaymentTypeCode)
    .map((r) => ({
      id: r.Id,
      code: String(r.PaymentTypeCode),
      title: String(r.Title || r.PaymentTypeCode),
      checklistVersion: Number(r.ChecklistVersion || 1),
      workflowCode: String(r.WorkflowCode || '')
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

export async function listChecklistTemplates(
  ctx: ISpRestContext,
  paymentTypeCode: string,
  versionNo: number
): Promise<IChecklistTemplate[]> {
  const filter =
    `PaymentTypeCode eq '${escapeOData(paymentTypeCode)}' and VersionNo eq ${Number(versionNo) || 1}`;
  const rows = await getItems<{
    Id: number;
    PaymentTypeCode?: string;
    VersionNo?: number;
    ItemCode?: string;
    ItemLabel?: string;
    IsRequired?: boolean;
    MinFileCount?: number;
    DisplayOrder?: number;
  }>(
    ctx,
    PAY_LISTS.ChecklistTemplates,
    `$filter=${filter}&$select=Id,PaymentTypeCode,VersionNo,ItemCode,ItemLabel,IsRequired,MinFileCount,DisplayOrder&$top=50`
  );
  return rows
    .map((r) => ({
      id: r.Id,
      paymentTypeCode: String(r.PaymentTypeCode || ''),
      versionNo: Number(r.VersionNo || 1),
      itemCode: String(r.ItemCode || ''),
      itemLabel: String(r.ItemLabel || r.ItemCode || ''),
      isRequired: !!r.IsRequired,
      minFileCount: Number(r.MinFileCount || 0),
      displayOrder: Number(r.DisplayOrder || 0)
    }))
    .filter((r) => !!r.itemCode)
    .sort((a, b) => a.displayOrder - b.displayOrder);
}
