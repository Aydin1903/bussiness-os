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
