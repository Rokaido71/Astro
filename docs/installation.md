# Installer Astro sous Windows

## Prérequis
Node.js 22.12+ avec npm, Windows et une conversation locale dans Codex. Le CLI choisi doit proposer `queue --thread --message`. Cette commande expérimentale est vérifiée sur certaines distributions locales seulement ; elle peut changer sans préavis. Aucun contournement par création automatique d’une nouvelle session n’est implémenté.

## Version portable Windows x64

1. Télécharger `Astro-v0.2.0-windows-x64.zip` et `SHA256SUMS` depuis la [release v0.2.0](https://github.com/Rokaido71/Astro/releases/tag/v0.2.0). Pour vérifier le téléchargement dans PowerShell : `Get-FileHash .\Astro-v0.2.0-windows-x64.zip -Algorithm SHA256`, puis comparer avec `SHA256SUMS`.
2. Extraire **tout** le ZIP dans un dossier accessible en écriture. Garder `Astro.exe` avec ses ressources et notices, sans le déplacer seul ni le lancer depuis l’archive.
3. Lancer `Astro-win32-x64/Astro.exe`. Le programme est **non signé** : Windows peut afficher un avertissement de provenance. Vérifier que le téléchargement vient de ce dépôt avant de l’exécuter. Aucun installateur ni service en arrière-plan n’est fourni.
4. Créer et autoriser votre bot Discord comme décrit ci-dessous, puis renseigner le serveur, la conversation Codex et le jeton dans les Réglages locaux. Le jeton n’est jamais à fournir dans GitHub ou dans une conversation.
5. Depuis `Astro-win32-x64/resources/app`, exécuter `node scripts/doctor.mjs` avec Node.js 22.12+ pour vérifier le CLI Codex. Donner à votre conversation le chemin absolu du `TASK-BRIDGE.md` de ce même dossier et vos autorisations explicites. Les commandes du [guide d’utilisation](usage.md) s’exécutent également depuis ce dossier.
6. Commencer par **Observer**, vérifier les salons, puis **Activer cette conversation**. Garder le PC éveillé, la connexion Internet, Astro et la conversation Codex disponibles. L’application redémarre en pause.

Electron est inclus dans le ZIP : aucune compilation ni commande `npm ci` n’est nécessaire pour le lancer. Node.js reste requis pour le contrôleur et les diagnostics utilisés par votre conversation Codex. Les données sont conservées dans `%APPDATA%\Astro`, indépendamment du dossier extrait. « Portable » désigne ici une distribution sans installateur, pas un profil de données stocké à côté de l’exécutable.

## Depuis les sources

1. Cloner le dépôt, ouvrir PowerShell dans ce dossier et exécuter `npm ci`.
2. Créer votre propre bot dans le [portail développeur Discord](https://discord.com/developers/applications). Activer **Message Content Intent**. Installer le bot sur votre serveur avec le scope `bot` et les permissions Voir le salon, Lire l’historique et Envoyer des messages (68608). Ne pas donner Administrateur ; exclure les salons privés avec les permissions Discord.
3. Exécuter `npm start`. Renseigner le serveur et l’identifiant UUID de votre conversation Codex dans Réglages. Le salon de référence est facultatif ; tous les salons texte accessibles du serveur seront suivis.
4. Saisir le jeton seulement dans le champ masqué local. Enregistrer en pause ; le champ est vidé immédiatement. Ne jamais fournir le jeton dans une conversation, un ticket GitHub ou un fichier de configuration.
5. Exécuter `npm run doctor`. La vérification ne lit pas le jeton et n’envoie aucun ticket. Elle confirme seulement la présence des options CLI attendues. Si nécessaire, indiquer le chemin exact de votre exécutable Codex dans les réglages.
6. Donner à votre conversation Codex le chemin local de [TASK-BRIDGE.md](../TASK-BRIDGE.md), et autoriser explicitement son usage avec le serveur et les salons que vous avez choisis. Définir les règles de réponse et les outils autorisés. Commencer par Observer ; vérifier les salons via le contrôleur avant Activer.

## Données et configuration
Par défaut, les données sont dans `%APPDATA%\Astro`. L’application et le contrôleur doivent utiliser le même dossier. Pour isoler un profil, définir `$env:ASTRO_DATA_DIR = 'D:\AstroData'` dans le terminal avant de lancer l’application et les commandes.

L’interface écrit `transport.json` (champs publics) et `discord-token.bin` (jeton chiffré). Pour préparer les réglages hors UI, copier `config.example.json` vers `config.local.json` dans le dossier de données, puis remplir les champs sans ajouter de jeton. Une configuration sauvegardée dans l’UI prend ensuite priorité. Le chemin Codex explicite est prioritaire ; sinon Astro cherche les installations locales sous `%LOCALAPPDATA%\OpenAI\Codex\bin`.

Les fichiers de chaque salon contiennent du contexte privé. Ne pas les publier ni les recopier dans le dépôt. Le chiffrement Windows protège contre d’autres comptes Windows, pas contre tous les programmes exécutés sous le même compte. Voir [sécurité](../SECURITY.md).
