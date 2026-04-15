export interface UserProfile {
  uid: string;
  displayName: string;
  email?: string;
  photoURL?: string;
  role?: string;
}

export interface Session {
  id: string;
  shortId: string;
  name: string;
  createdBy: string;
  createdAt: any;
  participants: string[];
  activeWineId?: string;
  status: 'active' | 'completed' | 'terminated';
  summary?: string;
  hostId?: string;
}

export interface Wine {
  id: string;
  sessionId: string;
  name: string;
  label: string;
  order: number;
  revealed: boolean;
  analysis?: string;
  research?: string;
  grapeVariety?: string;
  price?: number;
  vintage?: number;
  region?: string;
}

export interface Rating {
  id?: string;
  userId: string;
  userName: string;
  wineId: string;
  sessionId: string;
  score: number;
  comment?: string;
  guessedGrapeVariety?: string;
  guessedPrice?: number;
  guessedVintage?: number;
  guessedRegion?: string;
  createdAt: any;
}

export interface Message {
  id: string;
  text: string;
  createdAt: any;
  anonymousName: string;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}
