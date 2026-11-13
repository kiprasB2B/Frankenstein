import '@fontsource/inter/300.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/jetbrains-mono/400.css';
import './styles/main.css';
import { App } from './app';

const app = new App(document.getElementById('app')!);
app.boot();
(window as unknown as { frankenstein: App }).frankenstein = app;
