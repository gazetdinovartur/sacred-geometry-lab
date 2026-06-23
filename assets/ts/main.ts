import '../styles/app.css';
import '../styles/mandala.css';
import '../styles/account.css';
import Alpine from 'alpinejs';
import { bootstrapLab, createLabShell } from './lab/LabApp';
import { accountPage } from './account/accountPage';

window.labShell = createLabShell;
window.accountPage = accountPage;
bootstrapLab();
Alpine.start();
