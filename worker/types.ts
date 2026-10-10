export type UserRole = 'ADMIN' | 'PIC_QAS' | 'AUDITOR_QAS' | 'VIEWER';

export interface AuthScope {
  role: UserRole;
  depotId: string | null;
  depotCode: string | null;
  canManageMaster: boolean;
  canManageUsers?: boolean;
}

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  mustChangePassword?: boolean;
  scopes: AuthScope[];
}

export interface Env {
  DB?: D1Database;
  EVIDENCE?: R2Bucket;
  ASSETS?: Fetcher;
  ENVIRONMENT?: string;
  APP_VERSION?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  JWT_DEV_SECRET?: string;
  GAS_WEBAPP_URL?: string;
  GAS_SECRET_TOKEN?: string;
  MAIL_FROM_ADDRESS?: string;
}

export interface Variables {
  requestId: string;
  user?: AuthUser;
  authError?: string;
  unmappedEmail?: string;
  authMethod?: 'APP_SESSION' | 'CLOUDFLARE_ACCESS';
  sessionId?: string;
}
