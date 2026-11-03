// Copie shared/countries.json vers functions/countries.json.
// Firebase déploie uniquement le dossier functions/, donc il lui faut sa propre copie.
import { copyFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
copyFileSync(resolve(root, 'shared/countries.json'), resolve(root, 'functions/countries.json'));
console.log('Pays synchronisés : functions/countries.json');
