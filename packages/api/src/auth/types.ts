export interface GoogleUserInfo {
  sub: string;
  email: string;
  name: string;
  picture?: string;
}

export interface AuthResult {
  user: {
    id: string;
    name: string | null;
    role: string;
  };
  mergedFrom: string | null;
}

export interface CurrentUser {
  id: string;
  name: string | null;
  avatarUrl: string | null;
  role: string;
  externalIdentities: Array<{
    provider: string;
    email: string | null;
  }>;
  contactMethods: Array<{
    type: string;
    value: string;
    verified: boolean;
    primary: boolean;
  }>;
}

export interface MeResponse {
  user: CurrentUser | null;
  mergedFrom: string | null;
}
