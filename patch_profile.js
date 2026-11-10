const fs = require('fs');

let code = fs.readFileSync('app.js', 'utf8');

// 1. Reemplazar handlePassengerPhotoChange y removeProfilePhotoHandler
const oldPhotoStart = code.indexOf('// Subida de Foto de Perfil\nwindow.handlePassengerPhotoChange = function(e) {');
const oldPhotoEnd = code.indexOf('window.loadPassengerProfileIntoForm = function() {');

if (oldPhotoStart !== -1 && oldPhotoEnd !== -1) {
  const newPhotoBlock = `// Subida y compresión inteligente de Foto de Perfil
window.handlePassengerPhotoChange = async function(e) {
  const fileInput = document.getElementById('passengerPhotoFileInput');
  const file = e && e.target && e.target.files ? e.target.files[0] : (fileInput?.files?.[0]);
  if (!file) return;

  if (typeof window.showToast === 'function') {
    window.showToast('⏳ Optimizando y guardando foto...');
  }

  try {
    const base64 = await window.compressAndResizeAvatar(file, 256, 256, 0.82);

    let session = (typeof window.getPassengerSession === 'function' ? window.getPassengerSession() : null) || {};
    session.avatar = base64;
    if (!session.id) session.id = 'pass_' + Date.now();
    if (!session.nombre) {
      session.nombre = document.getElementById('profPassengerName')?.value?.trim() || 'Pasajero';
    }

    const modalAvatarImg = document.getElementById('profileModalAvatarImg');
    const modalHeaderImg = document.getElementById('profileModalHeaderAvatarImg');
    const headerAvatar = document.getElementById('headerPassengerAvatar');
    const avatarPlaceholder = document.getElementById('profileModalAvatarPlaceholder');
    const btnRemove = document.getElementById('btnRemoveProfilePhoto');

    if (modalAvatarImg) { 
      modalAvatarImg.src = base64; 
      modalAvatarImg.style.display = 'block'; 
    }
    if (modalHeaderImg) { 
      modalHeaderImg.src = base64; 
    }
    if (headerAvatar) { 
      headerAvatar.src = base64; 
    }
    if (avatarPlaceholder) { 
      avatarPlaceholder.style.display = 'none'; 
    }
    if (btnRemove) { 
      btnRemove.classList.remove('hidden'); 
    }

    if (typeof window.savePassengerSession === 'function') {
      window.savePassengerSession(session);
    }

    try {
      const rawUsers = localStorage.getItem('rutaprivada_registered_passengers_v1');
      const users = rawUsers ? JSON.parse(rawUsers) : [];
      const cleanEmail = (session.email || '').toLowerCase();
      const idx = users.findIndex(u => (cleanEmail && u.email && u.email.toLowerCase() === cleanEmail) || (session.id && u.id === session.id));
      if (idx >= 0) {
        users[idx].avatar = base64;
        users[idx].updatedAt = Date.now();
      } else {
        users.push({ ...session, avatar: base64, updatedAt: Date.now() });
      }
      localStorage.setItem('rutaprivada_registered_passengers_v1', JSON.stringify(users));
    } catch(err){}

    try {
      if (typeof firebase !== 'undefined' && firebase.firestore) {
        const db = firebase.firestore();
        const docId = (session.email ? session.email.toLowerCase().replace(/[^a-z0-9_]/g, '_') : '') || session.id;
        if (docId) {
          db.collection('pasajeros').doc(docId).set({ avatar: base64, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true }).catch(() => {});
        }
      }
    } catch(err){}

    if (typeof window.showToast === 'function') {
      window.showToast('📸 ¡Foto de perfil guardada con éxito!');
    }
  } catch(err) {
    console.error('Error al procesar foto:', err);
    if (typeof window.showToast === 'function') {
      window.showToast('⚠️ No se pudo procesar la foto seleccionada.');
    }
  }
};

window.removeProfilePhotoHandler = function() {
  let session = (typeof window.getPassengerSession === 'function' ? window.getPassengerSession() : null) || {};
  session.avatar = '';

  const defaultAvatar = window.DEFAULT_PASSENGER_AVATAR;
  const modalAvatarImg = document.getElementById('profileModalAvatarImg');
  const modalHeaderImg = document.getElementById('profileModalHeaderAvatarImg');
  const headerAvatar = document.getElementById('headerPassengerAvatar');
  const avatarPlaceholder = document.getElementById('profileModalAvatarPlaceholder');
  const btnRemove = document.getElementById('btnRemoveProfilePhoto');

  if (modalAvatarImg) { modalAvatarImg.src = ''; modalAvatarImg.style.display = 'none'; }
  if (modalHeaderImg) { modalHeaderImg.src = defaultAvatar; }
  if (headerAvatar) { headerAvatar.src = defaultAvatar; }
  if (avatarPlaceholder) avatarPlaceholder.style.display = 'block';
  if (btnRemove) { btnRemove.classList.add('hidden'); }

  const fileInput = document.getElementById('passengerPhotoFileInput');
  if (fileInput) fileInput.value = '';

  if (typeof window.savePassengerSession === 'function') {
    window.savePassengerSession(session);
  }

  try {
    const rawUsers = localStorage.getItem('rutaprivada_registered_passengers_v1');
    const users = rawUsers ? JSON.parse(rawUsers) : [];
    const cleanEmail = (session.email || '').toLowerCase();
    const idx = users.findIndex(u => (cleanEmail && u.email && u.email.toLowerCase() === cleanEmail) || (session.id && u.id === session.id));
    if (idx >= 0) {
      users[idx].avatar = '';
      users[idx].updatedAt = Date.now();
      localStorage.setItem('rutaprivada_registered_passengers_v1', JSON.stringify(users));
    }
  } catch(e){}

  try {
    if (typeof firebase !== 'undefined' && firebase.firestore) {
      const db = firebase.firestore();
      const docId = (session.email ? session.email.toLowerCase().replace(/[^a-z0-9_]/g, '_') : '') || session.id;
      if (docId) {
        db.collection('pasajeros').doc(docId).set({ avatar: '' }, { merge: true }).catch(() => {});
      }
    }
  } catch(e){}

  if (typeof window.showToast === 'function') window.showToast('Foto de perfil eliminada.');
};\n\n`;
  code = code.substring(0, oldPhotoStart) + newPhotoBlock + code.substring(oldPhotoEnd);
  console.log('1. Photo handlers replaced successfully.');
} else {
  console.error('1. Could not find photo handlers block!');
}

// 2. Reemplazar loadPassengerProfileIntoForm
const oldLoadStart = code.indexOf('window.loadPassengerProfileIntoForm = function() {');
const oldLoadEnd = code.indexOf('window.openPassengerProfileModal = function() {', oldLoadStart);

if (oldLoadStart !== -1 && oldLoadEnd !== -1) {
  const newLoadBlock = `window.loadPassengerProfileIntoForm = function() {
  const session = window.getPassengerSession();

  const profName = document.getElementById('profPassengerName');
  const profPhone = document.getElementById('profPassengerPhone');
  const profEmail = document.getElementById('profPassengerEmail');
  const modalTitle = document.getElementById('profileModalNameTitle');
  const headerName = document.getElementById('headerPassengerName');
  const headerAvatar = document.getElementById('headerPassengerAvatar');
  const modalHeaderImg = document.getElementById('profileModalHeaderAvatarImg');
  const modalAvatarImg = document.getElementById('profileModalAvatarImg');
  const avatarPlaceholder = document.getElementById('profileModalAvatarPlaceholder');
  const btnRemovePhoto = document.getElementById('btnRemoveProfilePhoto');
  const defaultAvatar = window.DEFAULT_PASSENGER_AVATAR;

  if (session && (session.nombre || session.usuario || session.email || session.telefono)) {
    const displayName = session.nombre || session.usuario || (session.email ? session.email.split('@')[0] : 'Pasajero');
    const shortName = displayName.split(' ')[0];
    if (profName) profName.value = session.nombre || session.usuario || '';
    if (profPhone) profPhone.value = session.telefono || '';
    if (profEmail) profEmail.value = session.email || '';
    if (modalTitle) modalTitle.textContent = displayName;
    if (headerName) headerName.textContent = shortName;
    
    const hasPhoto = (typeof window.isCustomPassengerAvatar === 'function') ? window.isCustomPassengerAvatar(session.avatar) : Boolean(session.avatar && session.avatar.length > 20 && !session.avatar.includes('photo-1535713875002-d1d0cf377fde'));
    if (hasPhoto) {
      if (headerAvatar) headerAvatar.src = session.avatar;
      if (modalHeaderImg) modalHeaderImg.src = session.avatar;
      if (modalAvatarImg) {
        modalAvatarImg.src = session.avatar;
        modalAvatarImg.style.display = 'block';
      }
      if (avatarPlaceholder) avatarPlaceholder.style.display = 'none';
      if (btnRemovePhoto) btnRemovePhoto.classList.remove('hidden');
    } else {
      if (headerAvatar) headerAvatar.src = defaultAvatar;
      if (modalHeaderImg) modalHeaderImg.src = defaultAvatar;
      if (modalAvatarImg) { modalAvatarImg.src = ''; modalAvatarImg.style.display = 'none'; }
      if (avatarPlaceholder) avatarPlaceholder.style.display = 'block';
      if (btnRemovePhoto) btnRemovePhoto.classList.add('hidden');
    }
  } else {
    if (profName) profName.value = '';
    if (profPhone) profPhone.value = '';
    if (profEmail) profEmail.value = '';
    if (modalTitle) modalTitle.textContent = 'Mi Perfil de Pasajero';
    if (headerName) headerName.textContent = 'Iniciar Sesión';
    if (headerAvatar) headerAvatar.src = defaultAvatar;
    if (modalHeaderImg) modalHeaderImg.src = defaultAvatar;
    if (modalAvatarImg) { modalAvatarImg.src = ''; modalAvatarImg.style.display = 'none'; }
    if (avatarPlaceholder) avatarPlaceholder.style.display = 'block';
    if (btnRemovePhoto) btnRemovePhoto.classList.add('hidden');
  }
};\n\n`;
  code = code.substring(0, oldLoadStart) + newLoadBlock + code.substring(oldLoadEnd);
  console.log('2. loadPassengerProfileIntoForm replaced successfully.');
} else {
  console.error('2. Could not find loadPassengerProfileIntoForm block!');
}

// 3. syncPassengerSessionUI: mejorar detección de custom avatar
code = code.replace(
  `headerAvatar.src = (session.avatar && session.avatar.length > 10) ? session.avatar : defaultAvatar;`,
  `const hasCustomPhoto = (typeof window.isCustomPassengerAvatar === 'function') ? window.isCustomPassengerAvatar(session.avatar) : Boolean(session.avatar && session.avatar.length > 20 && !session.avatar.includes('photo-1535713875002-d1d0cf377fde'));\n    if (headerAvatar) headerAvatar.src = hasCustomPhoto ? session.avatar : defaultAvatar;`
);

code = code.replace(
  `modalHeaderImg.src = (session.avatar && session.avatar.length > 10) ? session.avatar : defaultAvatar;`,
  `modalHeaderImg.src = hasCustomPhoto ? session.avatar : defaultAvatar;`
);

code = code.replace(
  `if (session.avatar && session.avatar.length > 10) {
        modalAvatarImg.src = session.avatar;
        modalAvatarImg.style.display = 'block';
        avatarPlaceholder.style.display = 'none';
        if (btnRemovePhoto) btnRemovePhoto.classList.remove('hidden');
      } else {`,
  `if (hasCustomPhoto) {
        modalAvatarImg.src = session.avatar;
        modalAvatarImg.style.display = 'block';
        avatarPlaceholder.style.display = 'none';
        if (btnRemovePhoto) btnRemovePhoto.classList.remove('hidden');
      } else {`
);

// 4. savePassengerSession: no sobreescribir con unsplash
code = code.replace(
  `if (!user.avatar) user.avatar = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80';`,
  `if (!user.avatar || user.avatar.includes('photo-1535713875002-d1d0cf377fde')) {
        user.avatar = (user.avatar && !user.avatar.includes('photo-1535713875002-d1d0cf377fde')) ? user.avatar : '';
      }`
);

// 5. savePassengerSession: evitar cookies gigantes
code = code.replace(
  `document.cookie = \`rutaprivada_passenger_session_v1=\${encodeURIComponent(str)}; path=/; max-age=315360000; SameSite=Lax\`;`,
  `const cookieUser = { id: user.id, email: user.email, nombre: user.nombre, telefono: user.telefono };
          document.cookie = \`rutaprivada_passenger_session_v1=\${encodeURIComponent(JSON.stringify(cookieUser))}; path=/; max-age=315360000; SameSite=Lax\`;`
);

// 6. renderPassengerProfileUI: detección de avatar
code = code.replace(
  `headerPassengerAvatar.src = (user.avatar && user.avatar.length > 10) ? user.avatar : defaultAvatar;`,
  `const hasPhoto = (typeof window.isCustomPassengerAvatar === 'function') ? window.isCustomPassengerAvatar(user.avatar) : Boolean(user.avatar && user.avatar.length > 20 && !user.avatar.includes('photo-1535713875002-d1d0cf377fde'));
      if (headerPassengerAvatar) headerPassengerAvatar.src = hasPhoto ? user.avatar : defaultAvatar;
      if (profileModalHeaderAvatarImg) profileModalHeaderAvatarImg.src = hasPhoto ? user.avatar : defaultAvatar;`
);

code = code.replace(
  `if (user.avatar && user.avatar.length > 5) {
        if (profileModalAvatarImg) {
          profileModalAvatarImg.src = user.avatar;
          profileModalAvatarImg.style.display = 'block';
        }
        if (profileModalAvatarPlaceholder) {
          profileModalAvatarPlaceholder.style.display = 'none';
        }
        if (btnRemoveProfilePhoto) {
          btnRemoveProfilePhoto.classList.remove('hidden');
        }
      } else {`,
  `if (hasPhoto) {
        if (profileModalAvatarImg) {
          profileModalAvatarImg.src = user.avatar;
          profileModalAvatarImg.style.display = 'block';
        }
        if (profileModalAvatarPlaceholder) {
          profileModalAvatarPlaceholder.style.display = 'none';
        }
        if (btnRemoveProfilePhoto) {
          btnRemoveProfilePhoto.classList.remove('hidden');
        }
      } else {`
);

// 7. Event listeners duplicados en módulo de perfil: delegar a funciones globales
code = code.replace(
  `if (passengerPhotoFileInput) {
      passengerPhotoFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
          if (typeof showToast === 'function') showToast('⚠️ La imagen no debe superar los 5MB.');
          return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
          const base64 = event.target.result;
          const session = getPassengerSession() || {};
          session.avatar = base64;
          savePassengerSession(session);
          if (typeof showToast === 'function') showToast('📸 Foto de perfil guardada con éxito.');
        };
        reader.readAsDataURL(file);
      });
    }

    if (btnRemoveProfilePhoto) {
      btnRemoveProfilePhoto.addEventListener('click', () => {
        const session = getPassengerSession() || {};
        session.avatar = '';
        savePassengerSession(session);
        if (typeof showToast === 'function') showToast('Foto de perfil eliminada.');
      });
    }`,
  `if (passengerPhotoFileInput) {
      passengerPhotoFileInput.addEventListener('change', (e) => {
        if (typeof window.handlePassengerPhotoChange === 'function') {
          window.handlePassengerPhotoChange(e);
        }
      });
    }

    if (btnRemoveProfilePhoto) {
      btnRemoveProfilePhoto.addEventListener('click', (e) => {
        if (typeof window.removeProfilePhotoHandler === 'function') {
          window.removeProfilePhotoHandler(e);
        }
      });
    }`
);

// 8. Form submit duplicado: delegar a window.handlePassengerProfileSave
code = code.replace(
  `if (passengerProfileForm) {
      passengerProfileForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const session = getPassengerSession() || {};
        if (profPassengerName) session.nombre = profPassengerName.value.trim();
        if (profPassengerPhone) session.telefono = profPassengerPhone.value.trim();
        if (profPassengerEmail) session.email = profPassengerEmail.value.trim();
        
        savePassengerSession(session);
        closePassengerProfileModal();
        if (typeof showToast === 'function') showToast('✅ Datos de perfil guardados correctamente.');
      });
    }`,
  `if (passengerProfileForm) {
      passengerProfileForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (typeof window.handlePassengerProfileSave === 'function') {
          window.handlePassengerProfileSave(e);
        }
      });
    }`
);

fs.writeFileSync('app.js', code, 'utf8');
console.log('app.js patched and written successfully.');

