# Phase 2+ backlog (sau khi Happy Path PASS)

Không làm trong Phase 1. Làm lần lượt khi Flow CREATE→CONFIRM đã ổn định trên tenant.

## Nghiệp vụ

1. **`DECIDE` + `REJECT`** — **DONE trong 1.0.0.6**
   - Từ BPCM2 / BPCM3 / TCKT_CHECK / CHAIR → về `BPCM1_PREPARE`
   - Master `Status=Returned`, đóng WI hiện tại, mở WI điều chỉnh
   - Bắt buộc `reason` / note

2. **Gửi lại sau trả** — **DONE trong 1.0.0.6**
   - `SUBMIT` từ `Returned`: tăng `ReviewRound` (+1)
   - Luôn vào lại `BPCM2_TECH` (theo kế hoạch đã chốt / kit — không resume bước đã trả)
   - UAT: `scripts/05_UAT_Phase2_RejectResubmit.ps1`

3. **Checklist gate** — **DONE trong 1.0.0.7**
   - CREATE seed `DOC_REQUEST` + `DOC_INVOICE` (`Missing`, `IsRequired`)
   - Trước `SUBMIT`: đọc required ChecklistItems; chặn nếu `UploadedCount < MinFileCount`
   - UAT: `scripts/06_UAT_Phase2_ChecklistGate.ps1` (+ 04/05 mark Uploaded trước SUBMIT)

4. **UNC bắt buộc** — **DONE trong 1.0.0.8**
   - Trước `CONFIRM_PAYMENT` tại `TCKT_PAY`: GET `EMI_PAY_DocumentIndex` (`DocClass=UNC`, `IsCurrent`, có `FileUrl`; hoặc `uncDocumentKey`)
   - Không tin cờ client `uncVerified` / `skipUncForPilot` chỉ để bypass pilot
   - UAT: `scripts/07_UAT_Phase2_UncGate.ps1` (+ 04 seed UNC trước CONFIRM)

5. **CHAIR + PaymentDueAt** — **DONE trong 1.0.0.9**
   - PASS tại `CHAIR_APPROVE` yêu cầu `paymentDueAt` trong payload; ghi `Requests.PaymentDueAt`
   - UAT tự `Add-PnPField` nếu cột chưa có; script: `08_UAT_Phase2_ChairPaymentDueAt.ps1`

## Kỹ thuật Flow

6. **Dedupe chặt** — GET Commands theo `DedupeKey`; nếu bản khác đã `Succeeded` → no-op
7. **ETag Master** — không dùng `IF-MATCH: *` cho MERGE Requests; xử lý 412
8. **Catch / Failed** — Scope runAfter failed → Commands `Failed` + ErrorMessage an toàn (Choice `NEEDS_RECONCILIATION` chỉ sau khi ApproveChoice)
9. **ActivityPublic / ActivityInternal** — **DONE trong 1.0.0.11** (`ActivityKey={CommandKey}|{EventType}`)
9b. **`ACCEPT` + DueAt** — **DONE trong 1.0.0.11** (gate DECIDE/CONFIRM khi chưa `AcceptedAt`)
9c. **CHAIR hai bước** — **DONE trong 1.0.0.12** (duyệt hồ sơ giữ CHAIR → duyệt TT + `paymentDueAt` → TCKT_PAY)
10. **Trusted caller / OrgMembers gate** — spec `AUTH_ORGMEMBERS_GATE.md` (1.0.0.13). Allowlist `tinh.pt@emi.com.vn` + đóng vai; Manager mới ACCEPT/DECIDE/CONFIRM. SPFx đã mirror; Flow chưa.
11. **Concurrency = 1** trên trigger; xác nhận trên designer sau Import
12. ~~**Đọc StepRecipients / WorkflowSteps**~~ — DONE trong Build Phase1 (SUBMIT/DECIDE đọc list; CREATE dùng `createdOUCode`)

## Dữ liệu / seed

13. **Seed `EMI_PAY_SPV`** — WorkflowVersions DRAFT→PUBLISHED, Steps, Recipients, PaymentTypes, Checklist từ kit CSV thật (không OU giả)
14. **Dọn drift gói 9** — quyết định giữ / archive `WF_SPV_PAYMENT` đã seed; tránh hai bộ cấu hình song song lâu dài
15. **Choice kit (tuỳ chọn)** — chỉ khi đồng ý ApproveChoice: `NEW`/`ARCHIVE_PENDING`/…; Phase 1 đang map sang Choice schema sẵn có

## Ngoài Core

16. **Dynamic Permission** — **Kit V1** trong `10.EMI_PAY_Dynamic_Permission_V1` (ma trận + PnP Apply/Validate theo RequestKey). Chưa gắn child Flow vào Core 1.0.0.12; DocsInternal/Archive ACL + reconcile remove = V1.1. Archive Manager (`ARCHIVE_RESULT`), Notification — Subflow sau; Core dừng ở `Archiving`
17. **Checklist lock trên Core** — SPFx đã `lockReviewedItems` sau DECIDE PASS (BPCM2/3/TCKT_CHECK). Mirror trong Flow (MERGE IsLocked cho mục Pass/Fail) để cổng thật không phụ thuộc UI.
18. **Dyn ACL Contribute Request (Draft/Returned)** — SPFx `patchRequestBusinessFields` cần Creator **Contribute** item Requests khi Nháp/Đã trả; Dyn V1 hiện chỉ Read.
