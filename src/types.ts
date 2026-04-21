export interface UserProfile {
  uid: string;
  displayName: string;
  email?: string;
  photoURL?: string;
}

export interface Session {
  id: string;
  shortId: string;
  name: string;
  createdBy: string;
  createdAt: string;
  participants: string[];
  status: 'active' | 'completed' | 'terminated';
  summary?: string;
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
  createdAt: string;
}

export interface Message {
  id: string;
  text: string;
  createdAt: string;
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
