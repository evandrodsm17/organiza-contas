import { deleteApp, initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { createUserWithEmailAndPassword, deleteUser, getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { addDoc, arrayUnion, collection, deleteDoc, deleteField, doc, getDoc, getDocs, getFirestore, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { deleteObject, getDownloadURL, getStorage, ref, uploadBytes } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-storage.js";
import { firebaseConfig } from "./firebase-config.js";

const configured = !Object.values(firebaseConfig).some((value) => String(value).includes("SUBSTITUA") || String(value).includes("SEU_PROJETO"));
let services;

function shiftDateByMonths(value, offset) {
  if (!value) return "";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  const target = new Date(Date.UTC(year, month - 1 + offset, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

function useServices() {
  if (!configured) throw new Error("Firebase não configurado. Preencha assets/js/firebase-config.js.");
  if (!services) {
    const app = initializeApp(firebaseConfig);
    services = {
      auth: getAuth(app), db: getFirestore(app), storage: getStorage(app)
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
  loginWithGoogle() {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    useServices().auth.useDeviceLanguage();
    return signInWithPopup(useServices().auth, provider);
  },
  logout: () => signOut(useServices().auth),
  async profile(uid) {
    const snap = await getDoc(doc(useServices().db, "users", uid));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  },
  observeManagements(uid, callback, onError) {
    return onSnapshot(query(collection(useServices().db, "managements"), where("memberIds", "array-contains", uid)),
      (snap) => callback(snap.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt-BR"))), onError);
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
  setMonthlyExpenseLimit(managementId, month, amount) {
    const value = Number(amount);
    return updateDoc(doc(useServices().db, "managements", managementId), {
      [`monthlyExpenseLimits.${month}`]: value > 0 ? value : deleteField(),
      updatedAt: serverTimestamp()
    });
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
  async saveRecurringTransactions(managementId, data, uid, months, recurrenceType = "fixed") {
    const total = Math.max(2, Math.min(60, Number.parseInt(months, 10) || 2));
    const db = useServices().db;
    const transactions = collection(db, "managements", managementId, "transactions");
    const batch = writeBatch(db);
    const groupId = globalThis.crypto?.randomUUID?.() || `${uid}-${Date.now()}`;
    const baseDescription = data.description.trim();

    for (let offset = 0; offset < total; offset += 1) {
      const sequence = offset + 1;
      const transactionRef = doc(transactions);
      const description = recurrenceType === "installment" ? `${baseDescription} (${sequence}/${total})` : baseDescription;
      batch.set(transactionRef, {
        ...data,
        description,
        amount: Number(data.amount),
        dueDate: shiftDateByMonths(data.dueDate, offset),
        plannedDate: shiftDateByMonths(data.plannedDate, offset),
        status: offset === 0 ? data.status : "pending",
        paidDate: offset === 0 ? data.paidDate : "",
        attachment: offset === 0 ? (data.attachment || null) : null,
        recurrenceGroupId: groupId,
        recurrenceIndex: sequence,
        recurrenceTotal: total,
        recurrenceType,
        recurrenceBaseDescription: baseDescription,
        createdAt: serverTimestamp(),
        createdBy: uid,
        updatedAt: serverTimestamp(),
        updatedBy: uid
      });
    }

    await batch.commit();
    return { count: total, groupId };
  },
  async updateRecurringTransactions(managementId, item, data, uid, scope) {
    const db = useServices().db;
    const transactions = collection(db, "managements", managementId, "transactions");
    const snapshot = await getDocs(query(transactions, where("recurrenceGroupId", "==", item.recurrenceGroupId)));
    const sourceIndex = Number(item.recurrenceIndex) || 1;
    const targets = snapshot.docs.filter((entry) => {
      const index = Number(entry.data().recurrenceIndex) || 1;
      return scope === "all" || (scope === "future" && index >= sourceIndex);
    });
    if (!targets.length) throw new Error("Nenhum lançamento da série foi encontrado.");

    const batch = writeBatch(db);
    const baseDescription = data.description.trim();
    const dueDateChanged = data.dueDate !== item.dueDate;
    const plannedDateChanged = data.plannedDate !== (item.plannedDate || item.dueDate || "");
    targets.forEach((entry) => {
      const target = entry.data();
      const targetIndex = Number(target.recurrenceIndex) || sourceIndex;
      const offset = targetIndex - sourceIndex;
      const description = target.recurrenceType === "installment"
        ? `${baseDescription} (${targetIndex}/${target.recurrenceTotal})`
        : baseDescription;
      const payload = {
        type: data.type,
        description,
        recurrenceBaseDescription: baseDescription,
        amount: Number(data.amount),
        category: data.category,
        dueDate: entry.id === item.id || dueDateChanged ? shiftDateByMonths(data.dueDate, offset) : target.dueDate,
        plannedDate: entry.id === item.id || plannedDateChanged ? shiftDateByMonths(data.plannedDate, offset) : (target.plannedDate || ""),
        notes: data.notes || "",
        updatedAt: serverTimestamp(),
        updatedBy: uid
      };
      if (entry.id === item.id) {
        payload.status = data.status;
        payload.paidDate = data.paidDate || "";
        payload.attachment = data.attachment || null;
      }
      batch.update(entry.ref, payload);
    });
    await batch.commit();
    return { count: targets.length };
  },
  async deleteRecurringTransactions(managementId, item, scope) {
    const db = useServices().db;
    const transactions = collection(db, "managements", managementId, "transactions");
    const snapshot = await getDocs(query(transactions, where("recurrenceGroupId", "==", item.recurrenceGroupId)));
    const sourceIndex = Number(item.recurrenceIndex) || 1;
    const targets = snapshot.docs.filter((entry) => {
      const index = Number(entry.data().recurrenceIndex) || 1;
      return scope === "all" || (scope === "future" && index >= sourceIndex);
    });
    if (!targets.length) throw new Error("Nenhum lançamento da série foi encontrado.");

    const batch = writeBatch(db);
    targets.forEach((entry) => batch.delete(entry.ref));
    await batch.commit();
    return {
      count: targets.length,
      attachmentPaths: targets.map((entry) => entry.data().attachment?.path).filter(Boolean)
    };
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
  async createManagedUser(data) {
    const secondaryApp = initializeApp(firebaseConfig, `user-creation-${Date.now()}`);
    const secondaryAuth = getAuth(secondaryApp);
    let credential;
    try {
      credential = await createUserWithEmailAndPassword(secondaryAuth, data.email.trim().toLowerCase(), data.password);
      await updateProfile(credential.user, { displayName: data.name.trim() });
      await setDoc(doc(useServices().db, "users", credential.user.uid), {
        name: data.name.trim(), email: data.email.trim().toLowerCase(), role: "user", active: true,
        canCreateManagement: Boolean(data.canCreateManagement), createdAt: serverTimestamp(),
        createdBy: useServices().auth.currentUser.uid
      });
      return { uid: credential.user.uid };
    } catch (error) {
      if (credential?.user) await deleteUser(credential.user).catch(() => {});
      throw error;
    } finally {
      await signOut(secondaryAuth).catch(() => {});
      await deleteApp(secondaryApp);
    }
  },
  async shareManagement({ managementId, email, role = "editor" }) {
    const users = await getDocs(query(collection(useServices().db, "users"), where("email", "==", email.trim().toLowerCase())));
    const target = users.docs.find((item) => item.data().active === true);
    if (!target) throw new Error("Nenhum usuário ativo foi encontrado com esse e-mail.");
    await updateDoc(doc(useServices().db, "managements", managementId), {
      memberIds: arrayUnion(target.id), [`memberRoles.${target.id}`]: role, updatedAt: serverTimestamp()
    });
    return { uid: target.id };
  },
  observeUsers(callback, onError) {
    return onSnapshot(query(collection(useServices().db, "users"), orderBy("name")),
      (snap) => callback(snap.docs.map((item) => ({ id: item.id, ...item.data() }))), onError);
  },
  setUserAccess(uid, data) { return updateDoc(doc(useServices().db, "users", uid), data); }
};
