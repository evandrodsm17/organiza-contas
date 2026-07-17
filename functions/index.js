import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { HttpsError, onCall } from "firebase-functions/v2/https";

initializeApp();
const db = getFirestore();

async function requireMaster(uid) {
  if (!uid) throw new HttpsError("unauthenticated", "Entre para continuar.");
  const profile = await db.doc(`users/${uid}`).get();
  if (!profile.exists || profile.data().role !== "master" || !profile.data().active) {
    throw new HttpsError("permission-denied", "Apenas o usuário master pode executar esta ação.");
  }
}

export const createManagedUser = onCall({ region: "southamerica-east1" }, async (request) => {
  await requireMaster(request.auth?.uid);
  const { name, email, password, canCreateManagement = false } = request.data || {};
  if (!name?.trim() || !email?.trim() || String(password || "").length < 8) {
    throw new HttpsError("invalid-argument", "Informe nome, e-mail e senha temporária com pelo menos 8 caracteres.");
  }
  const user = await getAuth().createUser({ displayName: name.trim(), email: email.trim().toLowerCase(), password, emailVerified: false, disabled: false });
  try {
    await db.doc(`users/${user.uid}`).set({ name: name.trim(), email: email.trim().toLowerCase(), role: "user", active: true, canCreateManagement: Boolean(canCreateManagement), createdAt: FieldValue.serverTimestamp(), createdBy: request.auth.uid });
  } catch (error) { await getAuth().deleteUser(user.uid); throw error; }
  return { uid: user.uid };
});

export const shareManagement = onCall({ region: "southamerica-east1" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Entre para continuar.");
  const { managementId, email, role = "editor" } = request.data || {};
  if (!managementId || !email || !["editor", "viewer"].includes(role)) throw new HttpsError("invalid-argument", "Dados de compartilhamento inválidos.");
  const managementRef = db.doc(`managements/${managementId}`);
  const management = await managementRef.get();
  if (!management.exists || management.data().ownerId !== uid) throw new HttpsError("permission-denied", "Apenas o proprietário pode compartilhar este gerenciamento.");
  let target;
  try { target = await getAuth().getUserByEmail(email.trim().toLowerCase()); } catch { throw new HttpsError("not-found", "Nenhum usuário autorizado foi encontrado com esse e-mail."); }
  const profile = await db.doc(`users/${target.uid}`).get();
  if (!profile.exists || !profile.data().active) throw new HttpsError("failed-precondition", "O usuário está inativo ou não autorizado.");
  await managementRef.update({ memberIds: FieldValue.arrayUnion(target.uid), [`memberRoles.${target.uid}`]: role, updatedAt: FieldValue.serverTimestamp() });
  return { uid: target.uid };
});
