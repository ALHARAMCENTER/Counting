// English is the reference catalogue: every other language must define the same keys.
export const en = {
  appName: 'Counting',
  langName: 'English',
  chooseLanguage: 'Choose language',
  continue: 'Continue',
  save: 'Save',
  cancel: 'Cancel',
  back: 'Back',
  ok: 'OK',
  retry: 'Try again',

  pinSetupTitle: 'Create supervisor PIN',
  pinSetupHint: 'Only the supervisor should know it.',
  pinNotSecurity: 'The PIN stops mistakes. It is not a security lock.',
  pinEnter: 'Enter PIN',
  pinConfirm: 'Enter PIN again',
  pinMismatch: 'PINs do not match.',
  pinTooShort: 'Use 4 to 8 digits.',
  pinWrong: 'Wrong PIN.',
  pinRequired: 'Supervisor PIN',

  homeTitle: 'Stock count',
  startCount: 'Start count',
  settings: 'Settings',
  language: 'Language',

  storageOk: 'Storage is protected.',
  storageNotPersisted: 'Storage is NOT protected. Install the app to the home screen, then try again.',
  storageUnknown: 'Cannot check storage protection.',

  insecureTitle: 'Cannot run here',
  insecureBody: 'Open the app from its https link.',

  updateAvailable: 'A new version is ready.',
  updateNow: 'Update now',

  privacyTitle: 'Privacy',
  privacyBody:
    'The app link is public. All count data stays on this device only. Nothing is sent to the internet.',
  version: 'Version',
} as const;

export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;
