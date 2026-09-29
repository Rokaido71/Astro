# Astro

![Windows](https://img.shields.io/badge/Windows-local-111111?style=flat-square) ![Node.js 22.12+](https://img.shields.io/badge/Node.js-22.12%2B-111111?style=flat-square) ![MIT](https://img.shields.io/badge/licence-MIT-111111?style=flat-square)

Un bot Discord officiel relié à votre conversation Codex existante. Astro suit les salons autorisés, conserve leur contexte séparément et répond dans le salon d’origine. Le tableau de bord local permet d’observer, d’activer ou de tout mettre en pause.

[Installer](docs/installation.md) · [Utiliser](docs/usage.md) · [Architecture](docs/architecture.md) · [Compiler pour Windows](docs/build.md) · [Contribuer](CONTRIBUTING.md)

## Avant de commencer

Windows, Node.js 22.12+ et un bot Discord personnel. L’intégration nécessite un exécutable Codex disposant de **`queue --thread --message`** : cette interface privée/expérimentale n’est pas une API publique garantie et peut être absente de votre distribution. Vérifiez-la avec `npm run doctor`. Le mode Observer fonctionne sans appel de modèle ; l’activation exige votre conversation configurée et un CLI compatible.

Astro ne crée pas une seconde session de modèle et n’utilise pas de clé API OpenAI. Les réponses utilisent les outils et les quotas de votre conversation Codex. Projet indépendant, non affilié à Discord ou OpenAI.

## Démarrer depuis les sources

```powershell
npm ci
npm test
npm run check
npm start
```

Dans Réglages, renseignez votre serveur, votre conversation Codex et le jeton du bot. Aucun serveur, compte ou identifiant de conversation n’est préconfiguré. Enregistrer ne connecte pas le bot : commencez par **Observer**. Le jeton est chiffré localement avec Electron safeStorage.

## Ce que fait Astro

- Un Gateway et des files isolées par salon texte, selon les permissions Discord.
- Détection événementielle, modifications et suppressions prises en compte.
- Réponse routée par ticket vers le salon d’origine, avec contrôle du contexte avant envoi.
- Vérification des emojis dans les catalogues de l’application et du serveur.
- Journal d’envoi persistant : une publication incertaine n’est jamais répétée automatiquement.

## Limites connues

Salons texte standards uniquement : pas de MP, fils ou forums, pas d’envoi de fichiers. Texte limité à 2 000 caractères. L’historique suivi est borné à 500 messages ; le rattrapage explicite à 100 messages sur 24 heures avec mention directe. Le journal bloque à 1 000 publications sans purge automatique. La pause interrompt le suivi ; les diagnostics demandés explicitement peuvent encore lire Discord.

L’export public est testé avec des services simulés et une interface Electron isolée. Il ne garantit pas que votre version de Codex dispose de la commande nécessaire. Les builds sont des dossiers Windows de développement, non signés, sans installateur ni mise à jour automatique. Aucun téléchargement de release n’est annoncé dans ce dépôt.

## Licence

[MIT](LICENSE), copyright 2026 Rokaido71. Les dépendances conservent leurs propres licences : [THIRD_PARTY.md](THIRD_PARTY.md). Aucun avatar, emoji, capture ou contenu de conversation Discord n’est distribué.
