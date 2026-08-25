/**
 * @business-os/contracts — paketin tek public giris noktasi.
 *
 * Not: DEVELOPMENT_RULES 2.3 "barrel index.ts re-export zincirleri" yasagi,
 * uygulama ici katmanlar arasindaki zincirleri hedefler. Burasi bir paket
 * sinirinin public API'sidir ve tek seviyedir — zincir olusturmaz.
 */
export { problemDetailsSchema, PROBLEM_TYPE_BASE } from './common/problem-details';
export type { ProblemDetails } from './common/problem-details';

export {
  paginationQuerySchema,
  paginationMetaSchema,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from './common/pagination';
export type { PaginationQuery, PaginationMeta } from './common/pagination';

export {
  healthResponseSchema,
  healthStatusSchema,
  dependencyHealthSchema,
  dependencyStatusSchema,
} from './health/health.contract';
export type {
  HealthResponse,
  HealthStatus,
  DependencyHealth,
  DependencyStatus,
} from './health/health.contract';

export {
  registerRequestSchema,
  loginRequestSchema,
  verifyEmailRequestSchema,
  resendVerificationRequestSchema,
  forgotPasswordRequestSchema,
  resetPasswordRequestSchema,
  changePasswordRequestSchema,
  messageResponseSchema,
  loginResponseSchema,
  switchTenantResponseSchema,
} from './auth/auth.contract';
export type {
  RegisterRequest,
  LoginRequest,
  VerifyEmailRequest,
  ResendVerificationRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  ChangePasswordRequest,
  MessageResponse,
  LoginResponse,
  SwitchTenantResponse,
} from './auth/auth.contract';

export {
  provisionTenantRequestSchema,
  provisionTenantResponseSchema,
} from './tenants/tenants.contract';
export type { ProvisionTenantRequest, ProvisionTenantResponse } from './tenants/tenants.contract';

export {
  membershipRoleSchema,
  myMembershipItemSchema,
  myMembershipsResponseSchema,
} from './memberships/memberships.contract';
export type {
  MembershipRoleName,
  MyMembershipItem,
  MyMembershipsResponse,
} from './memberships/memberships.contract';

export {
  createNoteRequestSchema,
  createNoteResponseSchema,
  askKnowledgeRequestSchema,
  askKnowledgeResponseSchema,
  answerSourceSchema,
  notesExistResponseSchema,
  dailyReportResponseSchema,
  noteListItemSchema,
  noteListResponseSchema,
  unindexedNotesResponseSchema,
  reindexNotesResponseSchema,
} from './knowledge/knowledge.contract';
export type {
  CreateNoteRequest,
  CreateNoteResponse,
  AskKnowledgeRequest,
  AskKnowledgeResponse,
  AnswerSource,
  NotesExistResponse,
  DailyReportResponse,
  NoteListItem,
  NoteListResponse,
  UnindexedNotesResponse,
  ReindexNotesResponse,
} from './knowledge/knowledge.contract';

export {
  companySchema,
  companyListRowSchema,
  createCompanyRequestSchema,
  updateCompanyRequestSchema,
  companyListResponseSchema,
  contactSchema,
  createContactRequestSchema,
  updateContactRequestSchema,
  contactListResponseSchema,
  interactionSchema,
  createInteractionRequestSchema,
  createInteractionResponseSchema,
  interactionListResponseSchema,
  unindexedInteractionsResponseSchema,
  reindexInteractionsResponseSchema,
  opportunityStageSchema,
  opportunityOrderSchema,
  opportunitySchema,
  opportunityListRowSchema,
  opportunityListResponseSchema,
  createOpportunityRequestSchema,
  updateOpportunityRequestSchema,
  followUpSchema,
  followUpListResponseSchema,
  OPPORTUNITY_STAGE_ORDER,
  OPPORTUNITY_STAGE_LABELS,
  CLOSED_OPPORTUNITY_STAGES,
  companySummarySchema,
  generateCompanySummaryResponseSchema,
} from './crm/crm.contract';
export type {
  Company,
  CompanyListRow,
  CreateCompanyRequest,
  UpdateCompanyRequest,
  CompanyListResponse,
  Contact,
  CreateContactRequest,
  UpdateContactRequest,
  ContactListResponse,
  Interaction,
  CreateInteractionRequest,
  CreateInteractionResponse,
  InteractionListResponse,
  UnindexedInteractionsResponse,
  ReindexInteractionsResponse,
  OpportunityStage,
  OpportunityOrder,
  Opportunity,
  OpportunityListRow,
  OpportunityListResponse,
  CreateOpportunityRequest,
  UpdateOpportunityRequest,
  FollowUp,
  FollowUpListResponse,
  CompanySummary,
  GenerateCompanySummaryResponse,
} from './crm/crm.contract';

export {
  projectStatusSchema,
  projectSchema,
  projectDetailSchema,
  projectListRowSchema,
  projectListResponseSchema,
  createProjectRequestSchema,
  updateProjectRequestSchema,
  taskStatusSchema,
  taskSchema,
  taskListResponseSchema,
  createTaskRequestSchema,
  updateTaskRequestSchema,
  progressNoteSchema,
  progressNoteListResponseSchema,
  createProgressNoteRequestSchema,
  createProgressNoteResponseSchema,
  unindexedProgressNotesResponseSchema,
  reindexProgressNotesResponseSchema,
  PROJECT_STATUS_LABELS,
  CLOSED_PROJECT_STATUSES,
  TASK_STATUS_LABELS,
  CLOSED_TASK_STATUSES,
} from './projects/projects.contract';
export type {
  ProjectStatus,
  Project,
  ProjectDetail,
  ProjectListRow,
  ProjectListResponse,
  CreateProjectRequest,
  UpdateProjectRequest,
  TaskStatus,
  Task,
  TaskListResponse,
  CreateTaskRequest,
  UpdateTaskRequest,
  ProgressNote,
  ProgressNoteListResponse,
  CreateProgressNoteRequest,
  CreateProgressNoteResponse,
  UnindexedProgressNotesResponse,
  ReindexProgressNotesResponse,
} from './projects/projects.contract';

// --- Finans (ADR-0034) ---
export {
  financeDirectionSchema,
  financeCategorySchema,
  createFinanceCategorySchema,
  updateFinanceCategorySchema,
  financeCategoryListResponseSchema,
  financeTransactionSchema,
  financeTransactionRowSchema,
  createFinanceTransactionSchema,
  updateFinanceTransactionSchema,
  financeTransactionListResponseSchema,
  cashflowCategoryTotalSchema,
  cashflowCurrencySummarySchema,
  cashflowSummarySchema,
  financeCommentarySchema,
  createFinanceCommentarySchema,
  createFinanceCommentaryResponseSchema,
  financeCommentaryListResponseSchema,
  unindexedCommentariesResponseSchema,
  reindexCommentariesResponseSchema,
  DIRECTION_LABELS,
} from './finance/finance.contract';
export type {
  FinanceDirection,
  FinanceCategory,
  CreateFinanceCategoryRequest,
  UpdateFinanceCategoryRequest,
  FinanceCategoryListResponse,
  FinanceTransaction,
  FinanceTransactionRow,
  CreateFinanceTransactionRequest,
  UpdateFinanceTransactionRequest,
  FinanceTransactionListResponse,
  CashflowCategoryTotal,
  CashflowCurrencySummary,
  CashflowSummary,
  FinanceCommentary,
  CreateFinanceCommentaryRequest,
  CreateFinanceCommentaryResponse,
  FinanceCommentaryListResponse,
  UnindexedCommentariesResponse,
  ReindexCommentariesResponse,
} from './finance/finance.contract';

export {
  appointmentStatusSchema,
  appointmentSchema,
  appointmentRowSchema,
  appointmentListResponseSchema,
  createAppointmentRequestSchema,
  updateAppointmentRequestSchema,
  reindexAppointmentsResponseSchema,
  APPOINTMENT_STATUS_LABELS,
  MAX_SERVICE_NOTE_CHARS,
  MAX_DURATION_MINUTES,
} from './appointments/appointments.contract';
export type {
  AppointmentStatus,
  Appointment,
  AppointmentRow,
  AppointmentListResponse,
  CreateAppointmentRequest,
  UpdateAppointmentRequest,
  ReindexAppointmentsResponse,
} from './appointments/appointments.contract';

// --- Belge / Sozlesme Yonetimi (ADR-0037) ---
// ⚠️ Yukleme istegi icin bir SEMA YOKTUR: govde `multipart/form-data`dir ve
// `FormData` bir JSON govdesi degildir. Paylasilan sey CEVAP semalari ve
// SINIRLARDIR.
export {
  documentMimeTypeSchema,
  documentSchema,
  documentRowSchema,
  documentListResponseSchema,
  documentResultSchema,
  updateDocumentRequestSchema,
  reindexDocumentsResponseSchema,
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_ACCEPT,
  PDF_MIME_TYPE,
  DOCX_MIME_TYPE,
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENT_CHUNKS,
  MAX_DOCUMENT_LABEL_CHARS,
} from './documents/documents.contract';
export type {
  DocumentMimeType,
  Document,
  DocumentRow,
  DocumentListResponse,
  DocumentResult,
  UpdateDocumentRequest,
  ReindexDocumentsResponse,
} from './documents/documents.contract';

// --- Stok / Envanter (ADR-0039) ---
// ⚠️ `quantity` bir DIZEDIR ve `number`a CEVRILMEZ (paranin ayni karari); ayrica
// TURETILMISTIR — sunucudan gelir, istemcide hesaplanmaz (ADR-0039 §2).
//
// ⚠️ "Toplam stok" anlamina gelecek TEK BIR ALAN BILE yoktur: farkli kalemlerin
// miktarlari TOPLANMAZ (§4.1 — `cashflowSummarySchema`nin para birimi icin
// yaptigi tip seviyesindeki korumanin aynisi).
//
// ⚠️ `createCountRequestSchema`da `delta` alani YOKTUR ve olmayacaktir: sayim
// farkini SUNUCU hesaplar (§3.2).
export {
  movementDirectionSchema,
  stockItemSchema,
  stockItemRowSchema,
  stockItemListResponseSchema,
  stockMovementSchema,
  stockMovementListResponseSchema,
  createStockItemRequestSchema,
  updateStockItemRequestSchema,
  createMovementRequestSchema,
  createCountRequestSchema,
  countResultSchema,
  reindexInventoryResponseSchema,
  stockLevelOf,
  MOVEMENT_DIRECTION_LABELS,
  STOCK_LEVEL_LABELS,
  NEAR_THRESHOLD_RATIO,
  MAX_ITEM_NOTE_CHARS,
  MAX_ITEM_NAME_CHARS,
  MAX_ITEM_SKU_CHARS,
  MAX_ITEM_UNIT_CHARS,
  MAX_MOVEMENT_NOTE_CHARS,
} from './inventory/inventory.contract';
export type {
  MovementDirection,
  StockItem,
  StockItemRow,
  StockItemListResponse,
  StockMovement,
  StockMovementListResponse,
  CreateStockItemRequest,
  UpdateStockItemRequest,
  CreateMovementRequest,
  CreateCountRequest,
  CountResult,
  ReindexInventoryResponse,
  StockLevel,
} from './inventory/inventory.contract';

// --- Tedarikci Yonetimi (ADR-0040) ---
// ⚠️ BU BOLUMDE OLMAYAN UC SEY, ucu de birer KARAR:
//
//   1. AŞAMA / FIRSAT SEMASI YOK (§2.1) — CRM'in `opportunity`si kopyalanmadi.
//      Belirsizlik tedarikcide degil SIPARISTEDIR ve siparis kapsam disi.
//      ⚠️ Buraya bir `stage` eklemek ADR-0036'nin esigini de getirir.
//   2. ODEME KOSULLARININ YAPISAL KARSILIGI YOK (§1.2) — `paymentTerms`
//      SERBEST METINDIR. Dogrudan sonucu: vade SORGULANAMAZ.
//   3. `updateInteraction` / `deleteInteraction` YOK — gunluk EKLEME-YALNIZ.
//
// ⚠️ `supplierUpdateResultSchema.staleAfterRename`: ad degisince o tedarikcinin
// TUM gorusme vektorleri bayatlar (ad AYRI SATIRDA yasar) ve sunucu onlari
// `PATCH`te YENILEMEZ. Stok'ta boyle bir alan YOKTU — orada ad ayni satirdaydi.
export {
  supplierSchema,
  supplierListResponseSchema,
  supplierUpdateResultSchema,
  createSupplierRequestSchema,
  updateSupplierRequestSchema,
  supplierContactSchema,
  supplierContactListResponseSchema,
  createSupplierContactRequestSchema,
  updateSupplierContactRequestSchema,
  supplierInteractionSchema,
  supplierInteractionListResponseSchema,
  createSupplierInteractionRequestSchema,
  reindexSuppliersResponseSchema,
  MAX_INTERACTION_BODY_CHARS,
  MAX_SUPPLIER_NAME_CHARS,
  MAX_PAYMENT_TERMS_CHARS,
  MAX_SUPPLIER_SHORT_TEXT_CHARS,
  MAX_SUPPLIER_ADDRESS_CHARS,
} from './suppliers/suppliers.contract';
export type {
  Supplier,
  SupplierListResponse,
  SupplierUpdateResult,
  CreateSupplierRequest,
  UpdateSupplierRequest,
  SupplierContact,
  SupplierContactListResponse,
  CreateSupplierContactRequest,
  UpdateSupplierContactRequest,
  SupplierInteraction,
  SupplierInteractionListResponse,
  CreateSupplierInteractionRequest,
  ReindexSuppliersResponse,
} from './suppliers/suppliers.contract';

/**
 * Teklif / Fatura (ADR-0041) — Faz 5'in SEKİZİNCİ iş modülü.
 *
 * ⚠️ İKİ BELGE TÜRÜ, TEK ŞEKİL: sunucuda tek tablo + `kind`, burada tek şema
 * + `kind`. Ama uçlar AYRIDIR (`/invoicing/quotes`, `/invoicing/invoices`) ve
 * izinler de ayrıdır (`quote:*` / `invoice:*`).
 *
 * ⚠️ Toplamlar `totals` altında AYRI gelir ve hiçbir kolonda saklanmaz (§1.3);
 * `total` diye bir belge alanı ARANMASIN.
 */
export {
  salesDocumentKindSchema,
  salesDocumentStatusSchema,
  salesDocumentLineSchema,
  salesDocumentSchema,
  documentTotalsSchema,
  salesDocumentViewSchema,
  salesDocumentListResponseSchema,
  salesDocumentLineInputSchema,
  createQuoteRequestSchema,
  createInvoiceRequestSchema,
  updateQuoteRequestSchema,
  updateInvoiceRequestSchema,
  decideQuoteRequestSchema,
  MAX_DOCUMENT_LINES,
  MAX_DOCUMENT_NOTES_CHARS,
  MAX_LINE_DESCRIPTION_CHARS,
  MAX_LINE_UNIT_CHARS,
  MAX_CUSTOMER_NAME_CHARS,
} from './invoicing/invoicing.contract';
export type {
  SalesDocumentKind,
  SalesDocumentStatus,
  SalesDocumentLine,
  SalesDocument,
  DocumentTotals,
  SalesDocumentView,
  SalesDocumentListResponse,
  SalesDocumentLineInput,
  CreateQuoteRequest,
  CreateInvoiceRequest,
  UpdateQuoteRequest,
  UpdateInvoiceRequest,
  DecideQuoteRequest,
} from './invoicing/invoicing.contract';

/**
 * IK / Personel (ADR-0043) — Faz 5'in DOKUZUNCU iş modülü.
 *
 * ⚠️ `Employee` tipi ÜCRET TAŞIMAZ ve taşıyamaz (§4.2 katman 1): ücret AYRI
 * bir şemada, AYRI bir uçtan, AYRI bir izinle (`compensation:read`) gelir.
 * Olmayan bir alan yanlışlıkla ekrana basılamaz.
 *
 * ⚠️ Serbest NOT alanı da yoktur (§1.1) — bir İK kaydındaki serbest metne ilk
 * yazılacak şey SAĞLIK BİLGİSİDİR ve §3 onu KESİN OLARAK dışarıda tutar.
 */
export {
  employeeSchema,
  employeeListResponseSchema,
  createEmployeeRequestSchema,
  updateEmployeeRequestSchema,
  employmentStatusSchema,
  compensationPeriodSchema,
  compensationRecordSchema,
  compensationHistoryResponseSchema,
  addCompensationRequestSchema,
  MAX_EMPLOYEE_NAME_CHARS,
  MAX_JOB_TITLE_CHARS,
  MAX_EMPLOYEE_CONTACT_CHARS,
  // --- IK v2 (ADR-0044) ---
  employmentTypeSchema,
  workModeSchema,
  leaveTypeSchema,
  leaveStatusSchema,
  leaveRequestSchema,
  leaveListResponseSchema,
  employeeLeaveResponseSchema,
  createLeaveRequestSchema,
  decideLeaveRequestSchema,
  hrOverviewSchema,
  supersedableCompensationSchema,
  MAX_DEPARTMENT_CHARS,
  MAX_ANNUAL_LEAVE_DAYS,
} from './hr/hr.contract';
export type {
  Employee,
  EmployeeListResponse,
  CreateEmployeeRequest,
  UpdateEmployeeRequest,
  EmploymentStatus,
  CompensationPeriod,
  CompensationRecord,
  CompensationHistoryResponse,
  AddCompensationRequest,
  EmploymentType,
  WorkMode,
  LeaveType,
  LeaveStatus,
  LeaveRequest,
  LeaveListResponse,
  EmployeeLeaveResponse,
  CreateLeaveRequest,
  DecideLeaveRequest,
  HrOverview,
  SupersedableCompensation,
} from './hr/hr.contract';

/**
 * Denetim kaydı (ADR-0043 §6) — PLATFORM ucu, bir iş modülü değil.
 *
 * ⚠️ Şemada "değer" alanı YOKTUR: yalnızca hangi alanın, ne zaman, kim
 * tarafından değiştirildiği (§6.5).
 */
export {
  auditEntrySchema,
  auditListResponseSchema,
  auditActionSchema,
} from './audit/audit.contract';
export type { AuditEntry, AuditListResponse, AuditAction } from './audit/audit.contract';

/**
 * Müşteri Geri Bildirimi / Anket (ADR-0045) — Faz 5'in ONUNCU iş modülü.
 *
 * ⚠️ BİR `updateFeedbackRequestSchema` ARANMASIN: kayıt GÜNCELLENMEZ (§2).
 * Bir geri bildirim BİZİM SÖZÜMÜZ DEĞİL, bir ÜÇÜNCÜ KİŞİNİN beyanıdır;
 * "düzeltmek" kurumsal hafızaya bir YALAN yazmak olurdu. ⚠️ Ama SİLİNEBİLİR
 * ve gerekçesi kolaylık değil KVKK'dır (§2.2) — yorum kişisel veri içerebilir.
 *
 * ⚠️ `LOW_RATING_MAX` BURADA yaşar ve İKİ TARAF DA onu okur: sunucu bu sayıyı
 * sayar, arayüz onunla etiket yazar. İki tarafta ayrı yazılsaydı ekran "≤2"
 * der, sunucu başka bir sayı sayardı ve fark SESSİZ olurdu.
 */
export {
  feedbackResponseSchema,
  feedbackListResponseSchema,
  createFeedbackRequestSchema,
  feedbackSummarySchema,
  reindexFeedbackResponseSchema,
  MAX_FEEDBACK_COMMENT_CHARS,
  MAX_FEEDBACK_CHANNEL_CHARS,
  MIN_RATING,
  MAX_RATING,
  LOW_RATING_MAX,
} from './feedback/feedback.contract';
export type {
  FeedbackResponse,
  FeedbackListResponse,
  CreateFeedbackRequest,
  FeedbackSummary,
  ReindexFeedbackResponse,
} from './feedback/feedback.contract';
