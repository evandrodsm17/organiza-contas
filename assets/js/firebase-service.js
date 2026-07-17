import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { addDoc, collection, deleteDoc, doc, getDoc, getFirestore, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-functions.js";
import { deleteObject, getDownloadURL, getStorage, ref, uploadBytes } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-storage.js";
import { firebaseConfig, functionsRegion } from "./firebase-config.js";

const configured = !Object.values(firebaseConfig).some((value) => String(value).includes("SUBSTITUA") || String(value).includes("SEU_PROJETO"));
let services;

function useServices() {
  if (!configured) throw new Error("Firebase não configurado. Preencha assets/js/firebase-config.js.");
  if (!services) {
    const app = initializeApp(firebaseConfig);
    services = {
      auth: getAuth(app), db: getFirestore(app), storage: getStorage(app),
      functions: getFunctions(app, functionsRegion)
    };
  }
  return services;
}

export const FirebaseService = {
  isConfigured: () => configured,
  observeAuth(callback) {
    if (!configured) return callback(null), () => {};
    return onAuthStateChanged(useServices().auth, callback);
  },
  login: (email, password) => signInWithEmailAndPassword(useServices().auth, email.trim(), password),
  logout: () => signOut(useServices().auth),
  async profile(uid) {
    const snap = await getDoc(doc(useServices().db, "users", uid));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  },
  observeManagements(uid, callback, onError) {
    return onSnapshot(query(collection(useServices().db, "managements"), where("memberIds", "array-contains", uid), orderBy("name")),
      (snap) => callback(snap.docs.map((item) => ({ id: item.id, ...item.data() }))), onError);
  },
  async createManagement(data, user) {
    return addDoc(collection(useServices().db, "managements"), {
      name: data.name.trim(), description: data.description?.trim() || "", currency: "BRL",
      ownerId: user.uid, memberIds: [user.uid], memberRoles: { [user.uid]: "owner" }, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
  },
  updateManagement(id, data) {
    return updateDoc(doc(useServices().db, "managements", id), { ...data, updatedAt: serverTimestamp() });
  },
  deleteManagement(id) { return deleteDoc(doc(useServices().db, "managements", id)); },
  observeTransactions(managementId, callback, onError) {
    return onSnapshot(query(collection(useServices().db, "managements", managementId, "transactions"), orderBy("dueDate")),
      (snap) => callback(snap.docs.map((item) => ({ id: item.id, ...item.data() }))), onError);
  },
  saveTransaction(managementId, data, uid, id) {
    const payload = { ...data, amount: Number(data.amount), updatedAt: serverTimestamp(), updatedBy: uid };
    if (id) return updateDoc(doc(useServices().db, "managements", managementId, "transactions", id), payload);
    return addDoc(collection(useServices().db, "managements", managementId, "transactions"), { ...payload, createdAt: serverTimestamp(), createdBy: uid });
  },
  deleteTransaction(managementId, id) { return deleteDoc(doc(useServices().db, "managements", managementId, "transactions", id)); },
  async uploadAttachment(managementId, file, uid) {
    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowed.includes(file.type)) throw new Error("Envie uma imagem JPG, PNG, WEBP ou um PDF.");
    if (file.size > 10 * 1024 * 1024) throw new Error("O anexo deve ter no máximo 10 MB.");
    const safeName = file.name.replace(/[^a-z0-9._-]/gi, "-");
    const path = `managements/${managementId}/receipts/${uid}-${Date.now()}-${safeName}`;
    const objectRef = ref(useServices().storage, path);
    await uploadBytes(objectRef, file, { contentType: file.type });
    return { name: file.name, type: file.type, path, url: await getDownloadURL(objectRef) };
  },
  async deleteAttachment(path) { if (path) await deleteObject(ref(useServices().storage, path)); },
  createManagedUser(data) { return httpsCallable(useServices().functions, "createManagedUser")(data); },
  shareManagement(data) { return httpsCallable(useServices().functions, "shareManagement")(data); },
  observeUsers(callback, onError) {
    return onSnapshot(query(collection(useServices().db, "users"), orderBy("name")),
      (snap) => callback(snap.docs.map((item) => ({ id: item.id, ...item.data() }))), onError);
  },
  setUserAccess(uid, data) { return updateDoc(doc(useServices().db, "users", uid), data); }
};
