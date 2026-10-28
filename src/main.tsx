import { render } from 'preact';
import { App } from './App';
import { initServiceWorker } from './lib/sw';
import './styles.css';

initServiceWorker();
render(<App />, document.getElementById('app')!);
