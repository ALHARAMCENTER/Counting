import { render } from 'preact';
import { App } from './App';
import { initServiceWorker } from './lib/sw';
import { initKeyboardHub } from './scan/hub';
import './styles.css';

initServiceWorker();
initKeyboardHub(); // before any screen: no reader character is ever missed
render(<App />, document.getElementById('app')!);
