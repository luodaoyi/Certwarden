export type UserRole = "super_admin" | "tenant_owner";
export type DomainStatus = "pending" | "healthy" | "error";
export type EndpointType = "email" | "telegram" | "webhook";

export interface ApiUser {
  id: number;
  tenant_id: number;
  username: string;
  email?: string;
  role: UserRole;
  email_verified: boolean;
  last_login_at?: string;
}

export interface ApiTenant {
  id: number;
  name: string;
  slug: string;
  public_status_title?: string;
  public_status_subtitle?: string;
  disabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface ApiDomain {
  id: number;
  hostname: string;
  port: number;
  target_ip?: string;
  enabled: boolean;
  status: DomainStatus;
  resolved_ip?: string;
  cert_valid_from?: string;
  cert_expires_at?: string;
  days_remaining?: number;
  cert_issuer?: string;
  cert_subject?: string;
  cert_common_name?: string;
  cert_dns_names?: string[];
  cert_serial_number?: string;
  cert_fingerprint_sha256?: string;
  cert_signature_algorithm?: string;
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
  config: Record<string, string>;
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
  resolved_ip?: string;
  cert_valid_from?: string;
  cert_expires_at?: string;
  days_remaining?: number;
  cert_issuer?: string;
  cert_subject?: string;
  cert_common_name?: string;
  cert_dns_names?: string[];
  cert_serial_number?: string;
  cert_fingerprint_sha256?: string;
  cert_signature_algorithm?: string;
  checked_at: string;
  created_at: string;
}

export interface PolicyView {
  threshold_days: number[];
  endpoint_ids: number[];
}

export interface TenantPolicies {
  default: PolicyView;
  overrides: Record<string, PolicyView>;
}

export interface TenantStats {
  domain_count: number;
  healthy_count: number;
  pending_count: number;
  error_count: number;
  next_expiry_at?: string;
  public_status_url: string;
}

export interface AdminTenantListItem {
  tenant: ApiTenant;
  owner: ApiUser;
  stats: TenantStats;
}

export interface ApiPagination {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface AdminTenantListResponse {
  tenants: AdminTenantListItem[];
  pagination: ApiPagination;
}

export interface AdminTenantDetail {
  tenant: ApiTenant;
  owner: ApiUser;
  stats: TenantStats;
}

export interface PublicTenantStatus {
  tenant: ApiTenant;
  summary: {
    overall_status: DomainStatus;
    domain_count: number;
    healthy_count: number;
    pending_count: number;
    error_count: number;
    next_expiry_at?: string;
  };
  public_url: string;
  domains: ApiDomain[];
}
