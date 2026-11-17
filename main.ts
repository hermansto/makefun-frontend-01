// Entry point: stage the static app and its screenshots into the output directory, then
// measure what landed there and record it as dossier.json.
import { cpSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-frontend.ts';

// Root of this entry: the folder this file sits in.
const here = dirname(fileURLToPath(import.meta.url));
// Where the bundle is assembled; overridable so a local run can write into ./out.
const out = process.env.MAKEFUN_OUTPUT_DIR || '/output';

// Nothing to ship without the shell page: fail fast instead of writing an empty dossier.
const entryPage = join(here, 'app', 'index.html');
if (!existsSync(entryPage)) {
  console.error('app/index.html is missing');
  process.exit(1);
}

mkdirSync(out, { recursive: true });

// The six-file frontend, verbatim.
cpSync(join(here, 'app'), join(out, 'app'), { recursive: true });

// Screenshots are optional: only ship them when the capture step produced some.
const shots = join(here, 'screenshots');
if (existsSync(shots)) {
  cpSync(shots, join(out, 'screenshots'), { recursive: true });
}

// Measure the staged tree: text caps, up to three screenshots, and a bound on the app files.
const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 3, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 16777216,
});

const dossierPath = join(out, 'dossier.json');
writeFileSync(dossierPath, dossier);

const bytes = statSync(dossierPath).size;
console.log(`dossier: ${dossierPath} (${bytes} bytes)`);
