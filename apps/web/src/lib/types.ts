export type UserRole = "super_admin" | "tenant_owner";
export type DomainStatus = "pending" | "healthy" | "error";
export type EndpointType = "email" | "telegram" | "webhook";

export interface ApiUser {
  id: number;
  tenant_id: number;
  email: string;
  role: UserRole;
  email_verified: boolean;
  last_login_at?: string;
}

export interface ApiDomain {
  id: number;
  hostname: string;
  port: number;
  enabled: boolean;
  status: DomainStatus;
  cert_expires_at?: string;
  days_remaining?: number;
  last_error?: string;
  last_checked_at?: string;
  last_successful_at?: string;
  next_check_at: string;
  check_interval_seconds: number;
  created_at: string;
  updated_at: string;
}

export interface ApiEndpoint {
  id: number;
  name: string;
  type: EndpointType;
  enabled: boolean;
  config_masked: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export interface DomainCheckResult {
  id: number;
  domain_id: number;
  tenant_id: number;
  status: DomainStatus;
  error_message?: string;
  cert_expires_at?: string;
  days_remaining?: number;
  checked_at: string;
}

export interface PolicyView {
  threshold_days: number[];
  endpoint_ids: number[];
}

export interface TenantPolicies {
  default: PolicyView;
  overrides: Record<string, PolicyView>;
}

export interface AdminUserListItem {
  user: ApiUser;
  tenant: {
    id: number;
    name: string;
    slug: string;
  };
}

export interface AdminUserDetail {
  user: ApiUser;
  tenant: {
    id: number;
    name: string;
    slug: string;
  };
  domains: ApiDomain[];
  endpoints: ApiEndpoint[];
  policies: TenantPolicies;
}
