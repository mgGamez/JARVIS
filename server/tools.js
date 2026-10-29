export function capabilities({ configured, imageModel, desktop, gmail }) {
  return [
    { id: 'memory', name: 'Personal memory', status: 'available', description: 'Explicitly approved browser-local facts; delete any time.' },
    { id: 'search', name: 'Web search', status: configured ? 'configured' : 'setup', description: 'Google Search grounding with sources. Select Search mode; model access and quota are verified per request.' },
    { id: 'research', name: 'Product research', status: configured ? 'configured' : 'setup', description: 'Grounded comparisons with source links. Select Research mode.' },
    { id: 'debug', name: 'Code & log analysis', status: configured ? 'configured' : 'setup', description: 'Attach a text file and select Debug. AI suggests fixes; no code is executed on your device.' },
    { id: 'images', name: 'Image generation', status: configured ? 'configured' : 'setup', description: `${imageModel}. Select Image mode; provider access or billing may be required.` },
    { id: 'reminders', name: 'Reminders & calendar', status: 'available', description: 'Persistent reminders with in-app alerts while open. Export calendar files for phone/desktop reminders.' },
    { id: 'mail', name: 'Gmail', status: gmail.connected ? 'connected' : gmail.configured ? 'connect' : 'setup', description: 'OAuth account consent; read/search mail and review each outgoing message before sending.' },
    { id: 'automation', name: 'Windows app launcher', status: desktop ? 'enabled' : 'setup', description: 'Opt-in launches of Notepad, Calculator and File Explorer on the Windows computer running JARVIS. Every launch needs approval.' },
    { id: 'phone', name: 'Phone handoffs', status: 'available', description: 'Calendar import and mail compose links. Direct Android/iOS app, alarm or screen control requires a native companion and is not implemented.' }
  ];
}
