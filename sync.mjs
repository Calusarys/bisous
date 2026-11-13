// Relit la base Notion « Les endroits où l'on s'est embrassé », chiffre les lieux
// avec le code de la carte et écrit data.json (seulement si quelque chose a changé).
// Variables d'environnement : NOTION_TOKEN (jeton de la connexion Notion), CODE_CARTE (code d'accès).
import { readFile, writeFile } from "node:fs/promises";
import { webcrypto as crypto } from "node:crypto";

const DATA_SOURCE = "339236de-fda7-80f6-a4fc-000bd766b274";
const { NOTION_TOKEN, CODE_CARTE } = process.env;
if (!NOTION_TOKEN || !CODE_CARTE) {
  console.error("Il manque NOTION_TOKEN ou CODE_CARTE dans les secrets du dépôt.");
  process.exit(1);
}

const texte = (rt) => (rt || []).map((r) => r.plain_text || "").join("").replace(/\s+/g, " ").trim();

async function lireNotion() {
  const lignes = [];
  let curseur;
  do {
    const rep = await fetch(`https://api.notion.com/v1/data_sources/${DATA_SOURCE}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NOTION_TOKEN}`,
        "Notion-Version": "2025-09-03",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ page_size: 100, ...(curseur ? { start_cursor: curseur } : {}) }),
    });
    if (!rep.ok) throw new Error(`Notion a répondu ${rep.status} : ${await rep.text()}`);
    const page = await rep.json();
    lignes.push(...page.results);
    curseur = page.has_more ? page.next_cursor : undefined;
  } while (curseur);
  return lignes;
}

function versCompact(p) {
  const pr = p.properties || {};
  const lieu = pr.Lieu && pr.Lieu.place;
  if (!lieu || typeof lieu.lat !== "number" || typeof lieu.lon !== "number") return null;
  const nom = texte(pr.Nom && pr.Nom.title) || lieu.name || "Un baiser";
  const date = (pr.Date && pr.Date.date) || {};
  return [nom, lieu.address || lieu.name || "", date.start || "", date.end || "", lieu.lat, lieu.lon];
}

const b64 = (buf) => Buffer.from(buf).toString("base64");

const pages = await lireNotion();
const baisers = pages.map(versCompact).filter(Boolean).sort((a, b) => (a[2] < b[2] ? 1 : -1));
const clair = JSON.stringify(baisers);

let ancien = null;
try { ancien = JSON.parse(await readFile("data.json", "utf8")); } catch {}

const salt = ancien && ancien.salt ? Buffer.from(ancien.salt, "base64") : crypto.getRandomValues(new Uint8Array(16));
const iterations = 600000;
const empreinte = b64(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(b64(salt) + CODE_CARTE + clair)));

if (ancien && ancien.empreinte === empreinte) {
  console.log(`Rien de nouveau (${baisers.length} baisers).`);
  process.exit(0);
}

const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(CODE_CARTE), "PBKDF2", false, ["deriveKey"]);
const cle = await crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
const iv = crypto.getRandomValues(new Uint8Array(12));
const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cle, new TextEncoder().encode(clair));

await writeFile("data.json", JSON.stringify({ salt: b64(salt), iterations, iv: b64(iv), ct: b64(ct), empreinte }));
console.log(`data.json mis à jour : ${baisers.length} baisers.`);
