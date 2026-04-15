import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Set up IPC listeners for real-time data
const ipc = window.electron?.ipcRenderer;

if (ipc) {
  ipc.on('audioLevel', (data: unknown) => {
    window.dispatchEvent(new CustomEvent('audioLevel', { detail: data }));
  });

  ipc.on('pitchDetected', (data: unknown) => {
    window.dispatchEvent(new CustomEvent('pitchDetected', { detail: data }));
  });

  ipc.on('midiNote', (data: unknown) => {
    window.dispatchEvent(new CustomEvent('midiNote', { detail: data }));
  });
}

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
