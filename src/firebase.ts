// Firebase stub — replaced by PostgreSQL + Authelia
export const auth: any = null;
export const db: any = null;
export const googleProvider: any = null;

export const signInWithPopup = async () => {};
export const signOut = async () => {};
export const onAuthStateChanged = () => () => {};
export const doc = () => {};
export const setDoc = async () => {};
export const getDoc = async () => ({ exists: () => false, data: () => ({}) });
export const getDocs = async () => ({ empty: true, docs: [] });
export const collection = () => {};
export const query = () => {};
export const where = () => {};
export const onSnapshot = () => () => {};
export const addDoc = async () => ({ id: '' });
export const updateDoc = async () => {};
export const serverTimestamp = () => new Date().toISOString();
