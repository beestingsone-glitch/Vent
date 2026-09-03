import React, { createContext, useContext, useState, useEffect } from 'react';

export type LanguageCode = 'en' | 'ar' | 'es' | 'fr';

export interface LanguageOption {
  code: LanguageCode;
  name: string;
  nativeName: string;
  dir: 'ltr' | 'rtl';
  flag: string;
}

export const LANGUAGES: LanguageOption[] = [
  { code: 'en', name: 'English', nativeName: 'English', dir: 'ltr', flag: '🇺🇸' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', dir: 'rtl', flag: '🇸🇦' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', dir: 'ltr', flag: '🇪🇸' },
  { code: 'fr', name: 'French', nativeName: 'Français', dir: 'ltr', flag: '🇫🇷' },
];

export const TRANSLATIONS = {
  en: {
    // Brand & General
    app_name: 'Vent',
    app_tagline: 'Let it out. Let it vanish.',
    panic_button: 'Panic Wipe',
    panic_wipe_confirm_title: 'Emergency Panic Wipe?',
    panic_wipe_confirm_desc: 'This will immediately clear all local session data, chat cache, and log you out. This action cannot be undone.',
    panic_wipe_success: 'All local session data has been purged.',
    install_app: 'Install App',
    install_pwa_title: 'Install Vent PWA',
    install_pwa_desc: 'Install Vent for quick access and full-screen encrypted messaging on your device.',
    install_now: 'Install Now',
    ios_install_instructions: 'Tap the Share icon in Safari, then tap "Add to Home Screen".',
    privacy_blur_title: 'Privacy Shield Active',
    privacy_blur_subtitle: 'Chat content is hidden to prevent shoulder-surfing. Click or tap anywhere to resume.',
    resume: 'Resume Chat',

    // Auth
    sign_in: 'Sign In',
    create_pseudonym: 'Create Pseudonym',
    sign_in_securely: 'Sign In Securely',
    create_pseudonymous_account: 'Create Pseudonymous Account',
    reset_update_password: 'Reset & Update Password',
    back_to_signin: 'Back to Sign In',
    account_email: 'Account Email Address',
    password: 'Password',
    new_password: 'New Password',
    confirm_new_password: 'Confirm New Password',
    forgot_password: 'Forgot Password?',
    reset_password_title: 'Reset Account Password',
    display_name_label: 'Public Display Name (Pseudonym)',
    display_name_placeholder: 'e.g. ShadowRaven, CipherFox',
    choose_avatar: 'Choose Profile Avatar',
    bio_label: 'Bio / Status (Optional)',
    bio_placeholder: 'e.g. Ephemeral communication enthusiast',
    confidential: 'Confidential',
    public_visible: 'Publicly visible',
    verifying_credentials: 'Verifying credentials...',
    password_updated_success: 'Password updated successfully. Please sign in with your new password.',
    zero_knowledge_box_title: 'Zero-Knowledge Pseudonym Architecture',
    zero_knowledge_box_desc: 'Your email and account metadata are strictly confidential. Other members only see your chosen pseudonym.',

    // Navigation & Status
    online: 'Online',
    away: 'Away',
    busy: 'Do Not Disturb',
    offline: 'Invisible',
    set_presence: 'Set Presence',
    edit_profile: 'Edit Profile / Pseudonym',
    admin_panel: 'Admin Audit Panel',
    logout: 'Log Out',
    new_chat_group: 'New Chat / Group',
    all: 'All',
    direct: 'Direct',
    groups: 'Groups',
    search_placeholder: 'Search chats or pseudonyms...',
    no_chats_found: 'No conversations found',
    no_chats_desc: 'Click "New Chat" to connect with pseudonyms or create a group room.',
    no_messages_yet_title: 'No messages yet',
    no_messages_yet_desc: 'Start a temporary conversation. Messages vanish according to the room timer.',
    encrypted_session: 'Encrypted Session',
    photo: 'Photo',
    video: 'Video',
    voice_note: 'Voice Note',
    blocked: 'BLOCKED',
    public_badge: 'PUBLIC',

    // Chat Area
    type_message_placeholder: 'Type an encrypted message...',
    press_enter_to_send: 'Press Enter to send',
    vanish_timer: 'Vanish Timer',
    room_settings: 'Room Settings',
    burn_on_read: 'Burn on read',
    expires_in: 'Expires in',
    expired_vanished: 'Message vanished',
    clear_chat: 'Clear Chat History',
    delete_chat: 'Delete Chat',
    block_user: 'Block User',
    unblock_user: 'Unblock User',
    voice_note_recording: 'Recording Voice Note...',
    voice_note_send: 'Send',
    voice_note_discard: 'Discard',
    voice_note_error: 'Microphone permission denied.',
    typing: 'is typing...',
    voice_call: 'Encrypted Call',
    language: 'Language',
    select_language: 'Select Language',
    compression_notice: 'Image was compressed to fit storage limits.',
    save_changes: 'Save Changes',
    saved: 'Saved successfully',
    cancel: 'Cancel',
    confirm: 'Confirm',
    close: 'Close',
    back: 'Back',
  },

  ar: {
    // Brand & General
    app_name: 'فينت',
    app_tagline: 'تحدث بحرية. ودعها تتلاشى.',
    panic_button: 'مسح الطوارئ',
    panic_wipe_confirm_title: 'تأكيد المسح الفوري للطوارئ؟',
    panic_wipe_confirm_desc: 'سيؤدي هذا إلى مسح كافة بيانات الجلسة والمحادثات المحلية فوراً وتسجيل الخروج. لا يمكن التراجع عن هذا الإجراء.',
    panic_wipe_success: 'تم مسح جميع بيانات الجلسة المحلية بنجاح.',
    install_app: 'تثبيت التطبيق',
    install_pwa_title: 'تثبيت تطبيق فينت المشفر',
    install_pwa_desc: 'قم بتثبيت فينت للوصول السريع والمحادثات المشفرة بملء الشاشة على جهازك.',
    install_now: 'تثبيت الآن',
    ios_install_instructions: 'اضغط على زر المشاركة في متصفح Safari، ثم اختر "إضافة إلى الشاشة الرئيسية".',
    privacy_blur_title: 'درع الخصوصية نشط',
    privacy_blur_subtitle: 'تم إخفاء محتوى الدردشة لحمايتك من المتطفلين. انقر أو المس الشاشة للمتابعة.',
    resume: 'استئناف المحادثة',

    // Auth
    sign_in: 'تسجيل الدخول',
    create_pseudonym: 'إنشاء اسم مستعار',
    sign_in_securely: 'تسجيل الدخول الآمن',
    create_pseudonymous_account: 'إنشاء حساب باسم مستعار',
    reset_update_password: 'إعادة تعيين وتحديث كلمة المرور',
    back_to_signin: 'العودة لتسجيل الدخول',
    account_email: 'البريد الإلكتروني للحساب',
    password: 'كلمة المرور',
    new_password: 'كلمة المرور الجديدة',
    confirm_new_password: 'تأكيد كلمة المرور الجديدة',
    forgot_password: 'نسيت كلمة المرور؟',
    reset_password_title: 'إعادة تعيين كلمة المرور',
    display_name_label: 'الاسم المستعار العلني',
    display_name_placeholder: 'مثال: ShadowRaven، CipherFox',
    choose_avatar: 'اختر الصورة الرمزية',
    bio_label: 'النبذة / الحالة (اختياري)',
    bio_placeholder: 'مثال: مهتم بالتواصل السري والمشفر',
    confidential: 'سري للغاية',
    public_visible: 'مرئي للجميع',
    verifying_credentials: 'جارٍ التحقق من البيانات...',
    password_updated_success: 'تم تحديث كلمة المرور بنجاح. يرجى تسجيل الدخول بكلمة المرور الجديدة.',
    zero_knowledge_box_title: 'بنية الأسماء المستعارة بدون معرفة مسبقة',
    zero_knowledge_box_desc: 'بريدك الإلكتروني وبياناتك سرية تماماً ولا تظهر لأحد. يرى الأعضاء الآخرون اسمك المستعار فقط.',

    // Navigation & Status
    online: 'متصل الآن',
    away: 'بالخارج',
    busy: 'عدم الإزعاج',
    offline: 'مخفي',
    set_presence: 'تغيير الحالة',
    edit_profile: 'تعديل الملف / الاسم المستعار',
    admin_panel: 'لوحة التدقيق والإدارة',
    logout: 'تسجيل الخروج',
    new_chat_group: 'محادثة / غرفة جديدة',
    all: 'الكل',
    direct: 'خاص',
    groups: 'مجموعات',
    search_placeholder: 'ابحث في المحادثات أو الأسماء المستعارة...',
    no_chats_found: 'لا توجد محادثات',
    no_chats_desc: 'اضغط على "محادثة جديدة" للتواصل بالأسماء المستعارة أو إنشاء غرفة.',
    no_messages_yet_title: 'لا توجد رسائل بعد',
    no_messages_yet_desc: 'ابدأ محادثة مؤقتة الآن. تتلاشى الرسائل تلقائياً حسب مؤقت الغرفة.',
    encrypted_session: 'جلسة مشفرة',
    photo: 'صورة',
    video: 'فيديو',
    voice_note: 'رسالة صوتية',
    blocked: 'محظور',
    public_badge: 'عامة',

    // Chat Area
    type_message_placeholder: 'اكتب رسالة مشفرة...',
    press_enter_to_send: 'اضغط Enter للإرسال',
    vanish_timer: 'مؤقت التلاشي',
    room_settings: 'إعدادات الغرفة',
    burn_on_read: 'حرق عند القراءة',
    expires_in: 'تنتهي خلال',
    expired_vanished: 'تلاشت الرسالة',
    clear_chat: 'مسح سجل الدردشة',
    delete_chat: 'حذف المحادثة',
    block_user: 'حظر المستخدم',
    unblock_user: 'إلغاء حظر المستخدم',
    voice_note_recording: 'جارٍ تسجيل رسالة صوتية...',
    voice_note_send: 'إرسال',
    voice_note_discard: 'إلغاء',
    voice_note_error: 'تم رفض إذن الميكروفون.',
    typing: 'يكتب الآن...',
    voice_call: 'اتصال مشفر',
    language: 'اللغة',
    select_language: 'اختر اللغة',
    compression_notice: 'تم ضغط الصورة لتناسب سعة التخزين المحلية.',
    save_changes: 'حفظ التغييرات',
    saved: 'تم الحفظ بنجاح',
    cancel: 'إلغاء',
    confirm: 'تأكيد',
    close: 'إغلاق',
    back: 'رجوع',
  },

  es: {
    // Brand & General
    app_name: 'Vent',
    app_tagline: 'Desahógate. Déjalo desvanecer.',
    panic_button: 'Borrado de Pánico',
    panic_wipe_confirm_title: '¿Borrado de emergencia inmediato?',
    panic_wipe_confirm_desc: 'Esto borrará de inmediato todos los datos de sesión local, caché de chat y cerrará su sesión.',
    panic_wipe_success: 'Todos los datos de sesión locales han sido eliminados.',
    install_app: 'Instalar App',
    install_pwa_title: 'Instalar PWA Vent',
    install_pwa_desc: 'Instala Vent para acceso rápido y mensajería encriptada en pantalla completa.',
    install_now: 'Instalar Ahora',
    ios_install_instructions: 'Toca el icono Compartir en Safari, luego selecciona "Agregar a la pantalla de inicio".',
    privacy_blur_title: 'Escudo de Privacidad Activo',
    privacy_blur_subtitle: 'El contenido del chat está oculto para evitar miradas indiscretas. Haz clic para reanudar.',
    resume: 'Reanudar Chat',

    // Auth
    sign_in: 'Iniciar Sesión',
    create_pseudonym: 'Crear Seudónimo',
    sign_in_securely: 'Iniciar Sesión Segura',
    create_pseudonymous_account: 'Crear Cuenta Seudónima',
    reset_update_password: 'Restablecer y Actualizar Contraseña',
    back_to_signin: 'Volver a Iniciar Sesión',
    account_email: 'Correo Electrónico',
    password: 'Contraseña',
    new_password: 'Nueva Contraseña',
    confirm_new_password: 'Confirmar Nueva Contraseña',
    forgot_password: '¿Olvidó su contraseña?',
    reset_password_title: 'Restablecer Contraseña',
    display_name_label: 'Nombre Público (Seudónimo)',
    display_name_placeholder: 'ej. ShadowRaven, CipherFox',
    choose_avatar: 'Elegir Avatar de Perfil',
    bio_label: 'Biografía / Estado (Opcional)',
    bio_placeholder: 'ej. Entusiasta de la privacidad',
    confidential: 'Confidencial',
    public_visible: 'Visible públicamente',
    verifying_credentials: 'Verificando credenciales...',
    password_updated_success: 'Contraseña actualizada con éxito. Inicie sesión con su nueva contraseña.',
    zero_knowledge_box_title: 'Arquitectura de Conocimiento Cero',
    zero_knowledge_box_desc: 'Su correo y datos son confidenciales. Los demás miembros solo ven su seudónimo.',

    // Navigation & Status
    online: 'En línea',
    away: 'Ausente',
    busy: 'No molestar',
    offline: 'Invisible',
    set_presence: 'Estado de Presencia',
    edit_profile: 'Editar Perfil / Seudónimo',
    admin_panel: 'Panel de Auditoría Admin',
    logout: 'Cerrar Sesión',
    new_chat_group: 'Nuevo Chat / Grupo',
    all: 'Todos',
    direct: 'Directo',
    groups: 'Grupos',
    search_placeholder: 'Buscar chats o seudónimos...',
    no_chats_found: 'No se encontraron conversaciones',
    no_chats_desc: 'Haz clic en "Nuevo Chat" para conectar con seudónimos o crear una sala grupal.',
    no_messages_yet_title: 'Sin mensajes aún',
    no_messages_yet_desc: 'Inicia una conversación temporal. Los mensajes desaparecen según el temporizador.',
    encrypted_session: 'Sesión Encriptada',
    photo: 'Foto',
    video: 'Video',
    voice_note: 'Nota de Voz',
    blocked: 'BLOQUEADO',
    public_badge: 'PÚBLICO',

    // Chat Area
    type_message_placeholder: 'Escribe un mensaje encriptado...',
    press_enter_to_send: 'Presiona Enter para enviar',
    vanish_timer: 'Temporizador de autodestrucción',
    room_settings: 'Ajustes de Sala',
    burn_on_read: 'Quemar al leer',
    expires_in: 'Expira en',
    expired_vanished: 'Mensaje desvanecido',
    clear_chat: 'Vaciar Historial',
    delete_chat: 'Eliminar Chat',
    block_user: 'Bloquear Usuario',
    unblock_user: 'Desbloquear Usuario',
    voice_note_recording: 'Grabando nota de voz...',
    voice_note_send: 'Enviar',
    voice_note_discard: 'Descartar',
    voice_note_error: 'Permiso de micrófono denegado.',
    typing: 'está escribiendo...',
    voice_call: 'Llamada Encriptada',
    language: 'Idioma',
    select_language: 'Seleccionar Idioma',
    compression_notice: 'La imagen fue comprimida para ajustarse al almacenamiento.',
    save_changes: 'Guardar Cambios',
    saved: 'Guardado con éxito',
    cancel: 'Cancelar',
    confirm: 'Confirmar',
    close: 'Cerrar',
    back: 'Atrás',
  },

  fr: {
    // Brand & General
    app_name: 'Vent',
    app_tagline: 'Exprimez-vous. Laissez disparaître.',
    panic_button: 'Panique Express',
    panic_wipe_confirm_title: 'Effacement d\'urgence immédiat ?',
    panic_wipe_confirm_desc: 'Cela effacera instantanément toutes les données de session locale, l\'historique et vous déconnectera.',
    panic_wipe_success: 'Toutes les données de session locales ont été purgées.',
    install_app: 'Installer l\'application',
    install_pwa_title: 'Installer la PWA Vent',
    install_pwa_desc: 'Installez Vent pour un accès rapide et une messagerie chiffrée en plein écran.',
    install_now: 'Installer',
    ios_install_instructions: 'Appuyez sur Partager dans Safari, puis "Sur l\'écran d\'accueil".',
    privacy_blur_title: 'Bouclier de Confidentialité Actif',
    privacy_blur_subtitle: 'Le contenu est masqué pour protéger votre vie privée. Cliquez pour reprendre.',
    resume: 'Reprendre le Chat',

    // Auth
    sign_in: 'Se Connecter',
    create_pseudonym: 'Créer un Pseudonyme',
    sign_in_securely: 'Connexion Sécurisée',
    create_pseudonymous_account: 'Créer un Compte Pseudonyme',
    reset_update_password: 'Réinitialiser le Mot de Passe',
    back_to_signin: 'Retour à la Connexion',
    account_email: 'Adresse E-mail',
    password: 'Mot de passe',
    new_password: 'Nouveau Mot de passe',
    confirm_new_password: 'Confirmer le Mot de passe',
    forgot_password: 'Mot de passe oublié ?',
    reset_password_title: 'Réinitialiser le Mot de passe',
    display_name_label: 'Pseudonyme Public',
    display_name_placeholder: 'ex. ShadowRaven, CipherFox',
    choose_avatar: 'Choisir un Avatar',
    bio_label: 'Bio / Statut (Optionnel)',
    bio_placeholder: 'ex. Passionné de communication chiffrée',
    confidential: 'Confidentiel',
    public_visible: 'Visible publiquement',
    verifying_credentials: 'Vérification en cours...',
    password_updated_success: 'Mot de passe mis à jour. Veuillez vous connecter.',
    zero_knowledge_box_title: 'Architecture Zéro Connaissance',
    zero_knowledge_box_desc: 'Votre e-mail et métadonnées restent strictement confidentiels. Les autres ne voient que votre pseudo.',

    // Navigation & Status
    online: 'En ligne',
    away: 'Absent',
    busy: 'Ne pas déranger',
    offline: 'Invisible',
    set_presence: 'Changer de Statut',
    edit_profile: 'Modifier Profil / Pseudo',
    admin_panel: 'Panneau d\'Administration',
    logout: 'Se Déconnecter',
    new_chat_group: 'Nouveau Chat / Groupe',
    all: 'Tous',
    direct: 'Direct',
    groups: 'Groupes',
    search_placeholder: 'Rechercher conversations ou pseudos...',
    no_chats_found: 'Aucune conversation trouvée',
    no_chats_desc: 'Cliquez sur "Nouveau Chat" pour démarrer une conversation éphémère.',
    no_messages_yet_title: 'Aucun message pour l\'instant',
    no_messages_yet_desc: 'Démarrez une discussion éphémère. Les messages disparaissent selon le minuteur.',
    encrypted_session: 'Session Chiffrée',
    photo: 'Photo',
    video: 'Vidéo',
    voice_note: 'Message Vocal',
    blocked: 'BLOQUÉ',
    public_badge: 'PUBLIC',

    // Chat Area
    type_message_placeholder: 'Écrire un message chiffré...',
    press_enter_to_send: 'Appuyez sur Entrée pour envoyer',
    vanish_timer: 'Minuteur d\'Évanouissement',
    room_settings: 'Paramètres du Salon',
    burn_on_read: 'Détruire après lecture',
    expires_in: 'Expire dans',
    expired_vanished: 'Message évanoui',
    clear_chat: 'Effacer l\'historique',
    delete_chat: 'Supprimer le Chat',
    block_user: 'Bloquer l\'Utilisateur',
    unblock_user: 'Débloquer l\'Utilisateur',
    voice_note_recording: 'Enregistrement vocal...',
    voice_note_send: 'Envoyer',
    voice_note_discard: 'Annuler',
    voice_note_error: 'Accès au microphone refusé.',
    typing: 'est en train d\'écrire...',
    voice_call: 'Appel Chiffré',
    language: 'Langue',
    select_language: 'Choisir la Langue',
    compression_notice: 'Image compressée pour optimiser le stockage local.',
    save_changes: 'Enregistrer',
    saved: 'Enregistré avec succès',
    cancel: 'Annuler',
    confirm: 'Confirmer',
    close: 'Fermer',
    back: 'Retour',
  },
};

export type TranslationKey = keyof typeof TRANSLATIONS.en;

interface LanguageContextType {
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  isRtl: boolean;
  t: (key: TranslationKey, fallback?: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const LANGUAGE_STORAGE_KEY = 'vent_language';

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<LanguageCode>(() => {
    try {
      const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY) as LanguageCode;
      if (saved && ['en', 'ar', 'es', 'fr'].includes(saved)) {
        return saved;
      }
    } catch {
      // ignore
    }
    return 'en';
  });

  const isRtl = language === 'ar';

  const setLanguage = (lang: LanguageCode) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    } catch (e) {
      console.warn('Failed to save language preference:', e);
    }
  };

  useEffect(() => {
    // Apply HTML dir and lang attributes
    document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
  }, [language, isRtl]);

  const t = (key: TranslationKey, fallback?: string): string => {
    const dict = TRANSLATIONS[language] || TRANSLATIONS.en;
    const str = dict[key] || TRANSLATIONS.en[key] || fallback || key;
    return str;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, isRtl, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export function useI18n() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useI18n must be used within a LanguageProvider');
  }
  return context;
}
