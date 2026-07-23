import { Email } from '../domain/email.value-object';
import { IpAddress } from '../domain/ip-address.value-object';
import { VerificationCodeRequest } from '../domain/verification-code-request.entity';
import { VerificationCodeRequestId } from '../domain/verification-code-request-id.value-object';

/** `platform.verification_code_requests` satirinin ham bicimi. */
export interface VerificationCodeRequestRow {
  readonly id: string;
  readonly emailNormalized: string;
  readonly ipAddress: string;
  readonly requestedAt: Date;
}

export function toVerificationCodeRequest(
  row: VerificationCodeRequestRow,
): VerificationCodeRequest {
  return VerificationCodeRequest.fromPersistence({
    id: VerificationCodeRequestId.create(row.id),
    email: Email.create(row.emailNormalized),
    ipAddress: IpAddress.create(row.ipAddress),
    requestedAt: row.requestedAt,
  });
}

export function toVerificationCodeRequestRow(
  request: VerificationCodeRequest,
): VerificationCodeRequestRow {
  return {
    id: request.id.value,
    emailNormalized: request.email.value,
    ipAddress: request.ipAddress.value,
    requestedAt: request.requestedAt,
  };
}
