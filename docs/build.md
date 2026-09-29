# Construire un dossier Windows

```powershell
npm ci
npm test
npm run check
npm run licenses
npm run build
```

Chaque build utilise un nouveau dossier `.build/public-…`, installe les dépendances de production depuis le lockfile et produit `output/Astro-win32-x64`. Il ne copie jamais les données utilisateur. `build-sha256.json` compare les fichiers source exportés et inventorie les fichiers empaquetés.

L’archive ASAR est désactivée : `resources/app/TASK-BRIDGE.md` et `resources/app/scripts/task-control.mjs` doivent rester lisibles par la conversation Codex et Node. Conserver le dossier complet, y compris les notices Electron/Chromium et les licences npm. Ne pas distribuer seulement Astro.exe.

Le résultat est un build de développement non signé, avec l’icône officielle Astro, sans installateur ni mise à jour automatique. Le workflow Windows du dépôt vérifie tests, syntaxe et compilation ; sa présence n’implique pas qu’une exécution distante a déjà réussi. Aucun jeton ou secret de signature n’est nécessaire aux tests ou à la compilation.

Pour une distribution portable, compresser le dossier `Astro-win32-x64` complet et publier son SHA-256 avec le ZIP. Les fichiers de données, jetons et configurations locales ne font pas partie du paquet public.
