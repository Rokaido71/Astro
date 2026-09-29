# Logiciels et ressources tiers

Le code propre à Astro est sous MIT, copyright 2026 Rokaido71. Les dépendances gardent leurs licences respectives ; consulter l’[inventaire complet verrouillé](docs/dependencies.md), généré depuis leurs manifestes installés.

| Dépendance directe | Rôle | Licence déclarée |
|---|---|---|
| @discordjs/rest 2.6.3 | Client REST Discord | Apache-2.0 |
| @discordjs/ws 2.0.4 | Gateway Discord | Apache-2.0 |
| discord-api-types 0.38.56 | Routes et types Discord | MIT |
| Electron 44.4.5 | Fenêtre et coffre système | MIT, avec composants tiers |
| @electron/packager 20.3.0 | Compilation de développement | BSD-2-Clause |

Les packages npm sont installés depuis le lockfile, sans code tiers recopié dans les sources. Le build conserve leurs fichiers de licence dans node_modules. Electron embarque Chromium et d’autres composants : conserver `LICENSE`, `LICENSES.chromium.html` et toutes les notices fournies dans le dossier Windows distribué. La licence MIT d’Astro ne remplace pas ces textes.

L’interface utilise du CSS, les polices système et l’identité Astro approuvée pour ce projet. Les exports du logo et de son symbole figurent dans `assets/brand/`. Aucun avatar, emoji, fichier de conversation, capture Discord, logo tiers ou asset repris d’un autre projet n’est inclus. Les noms Discord, OpenAI et Codex identifient des intégrations ; ils n’impliquent aucune affiliation ni transfert de droits sur ces marques.
