// CODEX-FIX: document Convex function paths used by backend/frontend integration without requiring generated imports in Vite.

export const convexFunctions = {
  documents: {
    listDocuments: 'documents:listDocuments',
    generateUploadUrl: 'documents:generateUploadUrl',
  },
  chat: {
    listSessions: 'chat:listSessions',
    getMessages: 'chat:getMessages',
  },
  settings: {
    getSettings: 'settings:getSettings',
    saveSettings: 'settings:saveSettings',
  },
} as const
