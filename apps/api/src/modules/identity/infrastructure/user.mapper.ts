import { Email } from '../domain/email.value-object';
import { parseUserStatus } from '../domain/user-status.value-object';
import { User } from '../domain/user.entity';
import { UserId } from '../../../shared/user-id.value-object';

/** `platform.users` satirinin ham bicimi. */
export interface UserRow {
  readonly id: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly status: string;
  readonly createdAt: Date;
}

export function toUser(row: UserRow): User {
  // Ham satir VO'lara cevrilir: bozuk bir kolon degeri entity'ye ulasmadan
  // sinirda yakalanir.
  return User.fromPersistence({
    id: UserId.create(row.id),
    email: Email.create(row.email),
    emailVerified: row.emailVerified,
    status: parseUserStatus(row.status),
    createdAt: row.createdAt,
  });
}

export function toUserRow(user: User): UserRow {
  return {
    id: user.id.value,
    email: user.email.value,
    emailVerified: user.emailVerified,
    status: user.status,
    createdAt: user.createdAt,
  };
}
