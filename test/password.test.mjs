import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyPassword, hashPassword } from '../server/store.mjs';

// Public interoperability vector published by Firebase, not a real credential.
// https://github.com/firebase/scrypt#password-hashing
export const firebaseVector = {
  algorithm:'SCRYPT',
  signerKey:'jxspr8Ki0RYycVU8zykbdLGjFQ3McFUH0uiiTvC8pVMXAn210wjLNmdZJzxUECKbm0QsEmYUSDzZvpjeJ9WmXA==',
  saltSeparator:'Bw==', rounds:8, memoryCost:14,
  salt:'42xEC+ixf3L2lw==',
  hash:'lSrfV15cpx95/sZS2W9c9Kp6i/LVgQNDNC/qzrCnh1SAyZvqmZqAjTdn3aoItz+VHjoZilo78198JAdRuid5lQ=='
};
test('Verificação local compatível com o vetor público Firebase SCRYPT', async () => {
  const encoded = `firebase:${Buffer.from(JSON.stringify(firebaseVector)).toString('base64url')}`;
  assert.equal(await verifyPassword('user1password',encoded),true);
  assert.equal(await verifyPassword('wrong-password',encoded),false);
  assert.equal(await verifyPassword('user1password-extra',encoded),false);
});
test('Senha local verifica o valor completo sem truncar', async () => {
  const original = 'a'.repeat(256);
  const encoded = await hashPassword(original);
  assert.equal(await verifyPassword(original,encoded),true);
  assert.equal(await verifyPassword(original+'different',encoded),false);
  assert.equal(await verifyPassword(null,encoded),false);
});
